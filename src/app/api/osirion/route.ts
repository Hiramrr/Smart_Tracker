import { NextRequest, NextResponse } from "next/server";

const OSIRION_BASE = "https://fnapi.osirion.gg/v1";
const TRACKER_BASE = "https://public-api.tracker.gg/v2/fortnite";
const FORTNITE_API_BASE = "https://fortnite-api.com/v2";
const TRACKER_API_KEY = process.env.TRACKER_API_KEY || process.env.TRN_API_KEY;
const FORTNITE_API_KEY = process.env.FORTNITE_API_KEY;

type RankedMode = {
  rankingType?: string;
  rankingTrackId?: string;
  lastUpdatedAt?: string;
  currentDivision?: unknown;
  highestDivision?: unknown;
  promotionProgress?: number;
  currentPlayerRanking?: number;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "error desconocido";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  try {
    let url: string;
    switch (action) {
      case "lookup": {
        const displayName = searchParams.get("displayName");
        if (!displayName) {
          return NextResponse.json(
            { success: false, error: "displayName es requerido" },
            { status: 400 }
          );
        }
        url = `${OSIRION_BASE}/accounts/lookup-by-display-name?displayName=${encodeURIComponent(displayName)}`;
        break;
      }
      case "stats": {
        const accountId = searchParams.get("accountId");
        if (!accountId) {
          return NextResponse.json(
            { success: false, error: "accountId es requerido" },
            { status: 400 }
          );
        }
        const timeframe = searchParams.get("timeframe");
        url = `${OSIRION_BASE}/stats/account?accountId=${accountId}`;
        if (timeframe) url += `&timeframe=${timeframe}`;
        break;
      }
      case "tracker-stats": {
        const displayName = searchParams.get("displayName");
        if (!displayName) {
          return NextResponse.json(
            { success: false, error: "displayName es requerido" },
            { status: 400 }
          );
        }
        if (!TRACKER_API_KEY) {
          return NextResponse.json(
            { success: false, error: "TRACKER_API_KEY no configurada" },
            { status: 503 }
          );
        }
        const platform = searchParams.get("platform") || "epic";
        url = `${TRACKER_BASE}/standard/profile/${encodeURIComponent(platform)}/${encodeURIComponent(displayName)}`;
        break;
      }
      case "fortnite-api-stats": {
        const accountId = searchParams.get("accountId");
        const displayName = searchParams.get("displayName");
        const timeframe = searchParams.get("timeframe") || "lifetime";
        if (!accountId && !displayName) {
          return NextResponse.json(
            { success: false, error: "accountId o displayName es requerido" },
            { status: 400 }
          );
        }
        if (!FORTNITE_API_KEY) {
          return NextResponse.json(
            { success: false, error: "FORTNITE_API_KEY no configurada" },
            { status: 503 }
          );
        }
        const params = new URLSearchParams({
          timeWindow: timeframe,
          image: "none",
        });
        if (accountId) {
          params.set("account", accountId);
        } else if (displayName) {
          params.set("name", displayName);
          params.set("accountType", "epic");
        }
        url = `${FORTNITE_API_BASE}/stats/br/v2?${params.toString()}`;
        break;
      }
      case "ranked-current": {
        const accountId = searchParams.get("accountId");
        if (!accountId) {
          return NextResponse.json(
            { success: false, error: "accountId es requerido" },
            { status: 400 }
          );
        }
        url = `${OSIRION_BASE}/ranked/account-ranks?accountId=${encodeURIComponent(accountId)}&lang=es`;
        break;
      }
      case "tournaments": {
        const region = searchParams.get("region");
        const includeHistoricData = searchParams.get("includeHistoricData");
        const lang = searchParams.get("lang") || "es";
        url = `${OSIRION_BASE}/tournaments?lang=${lang}`;
        if (region) url += `&region=${region}`;
        if (includeHistoricData !== null) url += `&includeHistoricData=${includeHistoricData}`;
        break;
      }
      case "leaderboard": {
        const leaderboardEventId = searchParams.get("leaderboardEventId");
        const leaderboardEventWindowId = searchParams.get("leaderboardEventWindowId");
        const page = searchParams.get("page") || "0";
        if (!leaderboardEventId || !leaderboardEventWindowId) {
          return NextResponse.json(
            { success: false, error: "leaderboardEventId y leaderboardEventWindowId son requeridos" },
            { status: 400 }
          );
        }
        url = `${OSIRION_BASE}/tournaments/leaderboard?leaderboardEventId=${encodeURIComponent(leaderboardEventId)}&leaderboardEventWindowId=${encodeURIComponent(leaderboardEventWindowId)}&page=${encodeURIComponent(page)}`;
        break;
      }
      case "shop": {
        const lang = searchParams.get("lang") || "es-419";
        if (!FORTNITE_API_KEY) {
          return NextResponse.json(
            { success: false, error: "FORTNITE_API_KEY no configurada" },
            { status: 503 }
          );
        }
        url = `${FORTNITE_API_BASE}/shop?language=${encodeURIComponent(lang)}`;
        break;
      }
      default:
        return NextResponse.json(
          { success: false, error: "accion no valida" },
          { status: 400 }
        );
    }

    const headers: Record<string, string> = {};
    if (action === "tracker-stats" && TRACKER_API_KEY) {
      headers["TRN-Api-Key"] = TRACKER_API_KEY;
    }
    if ((action === "fortnite-api-stats" || action === "shop") && FORTNITE_API_KEY) {
      headers["Authorization"] = FORTNITE_API_KEY;
    }

    const response = await fetch(url, { headers });
    const data = await response.json();

    if (action === "ranked-current" && response.ok) {
      const modes: RankedMode[] = Array.isArray(data?.modes) ? data.modes : [];
      const playedModes = modes.filter((mode) => mode?.currentDivision);
      const preferredRankingTypes = [
        "ranked-br-combined",
        "ranked-br",
        "ranked-zb-combined",
        "ranked-zb",
      ];

      let selectedMode: RankedMode | null = null;
      for (const rankingType of preferredRankingTypes) {
        selectedMode = playedModes.find(
          (mode) => mode?.rankingType === rankingType
        ) || null;
        if (selectedMode) break;
      }
      if (!selectedMode) selectedMode = playedModes[0] || modes[0] || null;

      return NextResponse.json({
        success: true,
        rank: selectedMode
          ? {
              rankingType: selectedMode.rankingType,
              rankingTrackId: selectedMode.rankingTrackId,
              lastUpdatedAt: selectedMode.lastUpdatedAt,
              currentDivision: selectedMode.currentDivision || null,
              highestDivision: selectedMode.highestDivision || null,
              promotionProgress: selectedMode.promotionProgress,
              currentPlayerRanking: selectedMode.currentPlayerRanking,
            }
          : null,
      });
    }

    if ((action === "tracker-stats" || action === "fortnite-api-stats") && response.ok) {
      return NextResponse.json({ success: true, data });
    }

    if (action === "tournaments" && response.ok) {
      return NextResponse.json({ success: true, tournaments: data.events || data.tournaments || data });
    }

    if (action === "leaderboard" && response.ok) {
      return NextResponse.json({ success: true, leaderboard: data.leaderboard || data });
    }

    if (action === "shop" && response.ok) {
      return NextResponse.json({ success: true, shop: data.data || data });
    }

    const status = response.status === 404 ? 404 : response.status;
    return NextResponse.json(data, { status });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
