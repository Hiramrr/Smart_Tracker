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

/**
 * Publica un evento en Kafka con los datos de la llamada API
 */
async function logApiCall(...args: unknown[]): Promise<void> {
  void args;
  // Data engineering logging is intentionally disabled for now.
  // The dashboard must query the external APIs without depending on DB/Kafka.
  return;
}

/**
 * Construye la respuesta transformada según la acción
 */
function buildResponse(action: string, data: unknown, status: number): NextResponse {
  if (action === "ranked-current" && status === 200) {
    const modes: RankedMode[] = Array.isArray((data as Record<string, unknown>)?.modes)
      ? ((data as Record<string, unknown>).modes as RankedMode[])
      : [];
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
      cached: true,
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

  if ((action === "tracker-stats" || action === "fortnite-api-stats") && status === 200) {
    return NextResponse.json({ success: true, cached: true, data });
  }

  if (action === "tournaments" && status === 200) {
    return NextResponse.json({
      success: true,
      cached: true,
      tournaments: (data as Record<string, unknown>)?.events ||
                  (data as Record<string, unknown>)?.tournaments ||
                  data,
    });
  }

  if (action === "leaderboard" && status === 200) {
    return NextResponse.json({
      success: true,
      cached: true,
      leaderboard: (data as Record<string, unknown>)?.leaderboard || data,
    });
  }

  if (action === "shop" && status === 200) {
    return NextResponse.json({
      success: true,
      cached: true,
      shop: (data as Record<string, unknown>)?.data || data,
    });
  }

  // Respuesta genérica para lookup y stats
  if (status === 200) {
    return NextResponse.json({ ...data as Record<string, unknown>, success: true, cached: true });
  }

  return NextResponse.json(data, { status });
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  let url = "";
  let cacheParams: Record<string, unknown> = {};

  try {
    switch (action) {
      case "lookup": {
        const displayName = searchParams.get("displayName");
        if (!displayName) {
          await logApiCall(req, action || "unknown", "", startTime, 400, null, false);
          return NextResponse.json(
            { success: false, error: "displayName es requerido" },
            { status: 400 }
          );
        }
        url = `${OSIRION_BASE}/accounts/lookup-by-display-name?displayName=${encodeURIComponent(displayName)}`;
        cacheParams = { displayName };
        break;
      }
      case "stats": {
        const accountId = searchParams.get("accountId");
        if (!accountId) {
          await logApiCall(req, action || "unknown", "", startTime, 400, null, false);
          return NextResponse.json(
            { success: false, error: "accountId es requerido" },
            { status: 400 }
          );
        }
        const timeframe = searchParams.get("timeframe");
        url = `${OSIRION_BASE}/stats/account?accountId=${accountId}`;
        if (timeframe) url += `&timeframe=${timeframe}`;
        cacheParams = { accountId, timeframe };
        break;
      }
      case "tracker-stats": {
        const displayName = searchParams.get("displayName");
        if (!displayName) {
          await logApiCall(req, action || "unknown", "", startTime, 400, null, false);
          return NextResponse.json(
            { success: false, error: "displayName es requerido" },
            { status: 400 }
          );
        }
        if (!TRACKER_API_KEY) {
          await logApiCall(req, action || "unknown", "", startTime, 503, null, false);
          return NextResponse.json(
            { success: false, error: "TRACKER_API_KEY no configurada" },
            { status: 503 }
          );
        }
        const platform = searchParams.get("platform") || "epic";
        url = `${TRACKER_BASE}/standard/profile/${encodeURIComponent(platform)}/${encodeURIComponent(displayName)}`;
        cacheParams = { displayName, platform };
        break;
      }
      case "fortnite-api-stats": {
        const accountId = searchParams.get("accountId");
        const displayName = searchParams.get("displayName");
        const timeframe = searchParams.get("timeframe") || "lifetime";
        if (!accountId && !displayName) {
          await logApiCall(req, action || "unknown", "", startTime, 400, null, false);
          return NextResponse.json(
            { success: false, error: "accountId o displayName es requerido" },
            { status: 400 }
          );
        }
        if (!FORTNITE_API_KEY) {
          await logApiCall(req, action || "unknown", "", startTime, 503, null, false);
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
        cacheParams = { accountId, displayName, timeframe };
        break;
      }
      case "ranked-current": {
        const accountId = searchParams.get("accountId");
        if (!accountId) {
          await logApiCall(req, action || "unknown", "", startTime, 400, null, false);
          return NextResponse.json(
            { success: false, error: "accountId es requerido" },
            { status: 400 }
          );
        }
        url = `${OSIRION_BASE}/ranked/account-ranks?accountId=${encodeURIComponent(accountId)}&lang=es`;
        cacheParams = { accountId };
        break;
      }
      case "tournaments": {
        const region = searchParams.get("region");
        const includeHistoricData = searchParams.get("includeHistoricData");
        const lang = searchParams.get("lang") || "es";
        url = `${OSIRION_BASE}/tournaments?lang=${lang}`;
        if (region) url += `&region=${region}`;
        if (includeHistoricData !== null) url += `&includeHistoricData=${includeHistoricData}`;
        cacheParams = { region, includeHistoricData, lang };
        break;
      }
      case "leaderboard": {
        const leaderboardEventId = searchParams.get("leaderboardEventId");
        const leaderboardEventWindowId = searchParams.get("leaderboardEventWindowId");
        const page = searchParams.get("page") || "0";
        if (!leaderboardEventId || !leaderboardEventWindowId) {
          await logApiCall(req, action || "unknown", "", startTime, 400, null, false);
          return NextResponse.json(
            { success: false, error: "leaderboardEventId y leaderboardEventWindowId son requeridos" },
            { status: 400 }
          );
        }
        url = `${OSIRION_BASE}/tournaments/leaderboard?leaderboardEventId=${encodeURIComponent(leaderboardEventId)}&leaderboardEventWindowId=${encodeURIComponent(leaderboardEventWindowId)}&page=${encodeURIComponent(page)}`;
        cacheParams = { leaderboardEventId, leaderboardEventWindowId, page };
        break;
      }
      case "shop": {
        const lang = searchParams.get("lang") || "es-419";
        if (!FORTNITE_API_KEY) {
          await logApiCall(req, action || "unknown", "", startTime, 503, null, false);
          return NextResponse.json(
            { success: false, error: "FORTNITE_API_KEY no configurada" },
            { status: 503 }
          );
        }
        url = `${FORTNITE_API_BASE}/shop?language=${encodeURIComponent(lang)}`;
        cacheParams = { lang };
        break;
      }
      default: {
        await logApiCall(req, action || "unknown", "", startTime, 400, null, false);
        return NextResponse.json(
          { success: false, error: "accion no valida" },
          { status: 400 }
        );
      }
    }

    // ==========================================
    // CACHE-ASIDE PATTERN
    // 1. Intentar obtener del cache
    // ==========================================
    void cacheParams;
    const cachedData = null;
    if (cachedData) {
      console.log(`[API] Cache HIT para ${action}`);
      await logApiCall(req, action || "unknown", url, startTime, 200, cachedData, true);
      return buildResponse(action, cachedData, 200);
    }

    // ==========================================
    // 2. Si no está en cache, consultar API externa
    // ==========================================
    const headers: Record<string, string> = {};
    if (action === "tracker-stats" && TRACKER_API_KEY) {
      headers["TRN-Api-Key"] = TRACKER_API_KEY;
    }
    if ((action === "fortnite-api-stats" || action === "shop") && FORTNITE_API_KEY) {
      headers["Authorization"] = FORTNITE_API_KEY;
    }

    const response = await fetch(url, { headers });
    const data = await response.json();

    // ==========================================
    // 3. Guardar en cache si la respuesta fue exitosa
    // ==========================================
    if (response.ok) {
      // Cache disabled until the database-backed implementation is revisited.
    }

    // ==========================================
    // 4. Publicar evento en Kafka
    // ==========================================
    await logApiCall(req, action || "unknown", url, startTime, response.status, data, false);

    // ==========================================
    // 5. Construir respuesta (sin cache)
    // ==========================================
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
        cached: false,
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
      return NextResponse.json({ success: true, cached: false, data });
    }

    if (action === "tournaments" && response.ok) {
      return NextResponse.json({ success: true, cached: false, tournaments: data.events || data.tournaments || data });
    }

    if (action === "leaderboard" && response.ok) {
      return NextResponse.json({ success: true, cached: false, leaderboard: data.leaderboard || data });
    }

    if (action === "shop" && response.ok) {
      return NextResponse.json({ success: true, cached: false, shop: data.data || data });
    }

    const status = response.status === 404 ? 404 : response.status;
    return NextResponse.json(data, { status });
  } catch (error: unknown) {
    // Publicar evento de error en Kafka
    await logApiCall(req, action || "unknown", url, startTime, 500, { error: getErrorMessage(error) }, false);

    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
