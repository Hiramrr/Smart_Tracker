import { NextRequest, NextResponse } from "next/server";

const OSIRION_BASE = "https://fnapi.osirion.gg/v1";
const TRACKER_BASE = "https://public-api.tracker.gg/v2/fortnite";
const FORTNITE_API_BASE = "https://fortnite-api.com/v2";
const OSIRION_API_KEY = process.env.OSIRION_API_KEY;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberOrNull(record[key]);
    if (value !== null && value >= 0) return value;
  }
  return null;
}

function getPlayers(data: unknown): Record<string, unknown>[] {
  const record = asRecord(data);
  return asArray(record.players || record.stats || record.results || record.leaderboard || data);
}

function getTournaments(data: unknown): Record<string, unknown>[] {
  const record = asRecord(data);
  return asArray(record.tournaments || record.events || data);
}

function normalizeTournamentPlacement(
  player: Record<string, unknown>,
  tournament: Record<string, unknown>,
  accountId: string
) {
  const placement = firstNumber(player, [
    "placement",
    "rank",
    "eventRank",
    "pointsRank",
    "scoreRank",
    "totalPointsRank",
    "sessionRank",
  ]);

  return {
    accountId,
    epicId: player.epicId || player.accountId || accountId,
    epicUsername: player.epicUsername || player.displayName || player.name || null,
    eventId: tournament.eventId || player.eventId || null,
    eventWindowId: tournament.eventWindowId || player.eventWindowId || null,
    startTime: tournament.startTime || null,
    endTime: tournament.endTime || null,
    totalMatches: numberOrNull(tournament.totalMatches) ?? firstNumber(player, ["matches", "totalMatches"]),
    parsingProgress: numberOrNull(tournament.parsingProgress),
    placement,
    points: firstNumber(player, ["points", "score", "totalPoints"]),
    eliminations: firstNumber(player, ["eliminations", "kills"]),
    assists: firstNumber(player, ["assists"]),
    avgPlacement: numberOrNull(player.avgPlacement),
    raw: player,
  };
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers });
  const data = await response.json();
  return { response, data };
}

async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchTournamentPages(opts: {
  accountId: string;
  headers: Record<string, string>;
  firstPage: Record<string, unknown>[];
  initialUrl: string;
  maxEvents: number;
  season: string | null;
}) {
  const seen = new Set<string>();
  const tournaments: Record<string, unknown>[] = [];
  const addPage = (page: Record<string, unknown>[]) => {
    for (const tournament of page) {
      const eventWindowId = typeof tournament.eventWindowId === "string" ? tournament.eventWindowId : "";
      if (!eventWindowId || seen.has(eventWindowId)) continue;
      seen.add(eventWindowId);
      tournaments.push(tournament);
      if (tournaments.length >= opts.maxEvents) break;
    }
  };

  addPage(opts.firstPage);
  const pageSize = 50;
  for (let fromIndex = pageSize; tournaments.length < opts.maxEvents && fromIndex < 250; fromIndex += pageSize) {
    const params = new URLSearchParams({
      epicIds: opts.accountId,
      includeHistoricData: "true",
      fromIndex: String(fromIndex),
      limit: String(pageSize),
    });
    if (opts.season) params.set("season", opts.season);

    const pageUrl = `${OSIRION_BASE}/tournaments?${params.toString()}`;
    if (pageUrl === opts.initialUrl) continue;
    const result = await fetchJson(pageUrl, opts.headers);
    if (!result.response.ok) break;
    const page = getTournaments(result.data);
    if (page.length === 0) break;
    addPage(page);
    if (page.length < pageSize) break;
  }

  return tournaments.slice(0, opts.maxEvents);
}

import { query, getCache, setCache, getCacheTtl } from "@/lib/db";

/**
 * Publica un evento en la base de datos (inicia el patrón Outbox)
 */
async function logApiCall(
  req: NextRequest,
  action: string,
  url: string,
  startTime: number,
  status: number,
  responseBody: unknown,
  _cached: boolean = false
): Promise<void> {
  void _cached;
  const durationMs = Date.now() - startTime;
  const requestWithIp = req as NextRequest & { ip?: string };
  const sourceIp = req.headers.get("x-forwarded-for") || requestWithIp.ip || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";

  // Determinar la fuente de la API
  let apiSource = "unknown";
  if (url.includes("osirion.gg")) apiSource = "osirion";
  else if (url.includes("tracker.gg")) apiSource = "tracker-gg";
  else if (url.includes("fortnite-api.com")) apiSource = "fortnite-api";

  try {
    // Insertar en api_calls. El trigger fn_api_call_to_outbox se encargará del resto.
    await query(
      `INSERT INTO api_calls (
        action, parameters, source_ip, user_agent,
        response_status, response_size, duration_ms,
        api_source, endpoint_url, response_body
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        action,
        JSON.stringify(Object.fromEntries(new URL(req.url).searchParams)),
        sourceIp,
        userAgent,
        status,
        responseBody ? JSON.stringify(responseBody).length : 0,
        durationMs,
        apiSource,
        url,
        responseBody ? JSON.stringify(responseBody) : null
      ]
    );

    // Si no es cache y fue exitoso, podríamos guardar la respuesta completa si es necesario
    // Para este proyecto, el consumer en Kafka se encargará de procesar los datos "interesantes"
  } catch (error) {
    console.error("[DataEngineering] Error logging API call:", error);
  }
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
      ranks: modes,
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

  if (action === "tournament-player-stats" && status === 200) {
    return NextResponse.json({
      success: true,
      cached: true,
      players: getPlayers(data),
      data,
    });
  }

  if (action === "player-tournament-placements" && status === 200) {
    return NextResponse.json({
      success: true,
      cached: true,
      ...(asRecord(data)),
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
      case "tournament-player-stats": {
        const accountId = searchParams.get("accountId") || searchParams.get("epicIds");
        const eventId = searchParams.get("eventId");
        const eventWindowId = searchParams.get("eventWindowId");
        const includeTeam = searchParams.get("includeTeam") || "false";
        if (!accountId || !eventWindowId) {
          await logApiCall(req, action || "unknown", "", startTime, 400, null, false);
          return NextResponse.json(
            { success: false, error: "accountId y eventWindowId son requeridos" },
            { status: 400 }
          );
        }
        const params = new URLSearchParams({
          eventWindowId,
          epicIds: accountId,
          include: searchParams.get("include") || "points,eliminations,assists,avgPlacement",
          includeRanks: "true",
          includeTeam,
          orderBy: searchParams.get("orderBy") || "points",
          orderByDescending: searchParams.get("orderByDescending") || "true",
          fromIndex: searchParams.get("fromIndex") || "0",
          limit: searchParams.get("limit") || "10",
        });
        if (eventId) params.set("eventId", eventId);
        url = `${OSIRION_BASE}/tournaments/stats?${params.toString()}`;
        cacheParams = { accountId, eventId, eventWindowId, includeTeam };
        break;
      }
      case "player-tournament-placements": {
        const accountId = searchParams.get("accountId") || searchParams.get("epicIds");
        if (!accountId) {
          await logApiCall(req, action || "unknown", "", startTime, 400, null, false);
          return NextResponse.json(
            { success: false, error: "accountId es requerido" },
            { status: 400 }
          );
        }
        const params = new URLSearchParams({ epicIds: accountId });
        const season = searchParams.get("season");
        const fromIndex = searchParams.get("fromIndex");
        const limit = searchParams.get("limit") || "50";
        const includeHistoricData = searchParams.get("includeHistoricData") ?? "true";
        if (season) params.set("season", season);
        if (fromIndex) params.set("fromIndex", fromIndex);
        if (limit) params.set("limit", limit);
        params.set("includeHistoricData", includeHistoricData);
        url = `${OSIRION_BASE}/tournaments?${params.toString()}`;
        cacheParams = {
          accountId,
          season,
          fromIndex,
          limit,
          includeHistoricData,
          placementLimit: searchParams.get("placementLimit") || searchParams.get("historyLimit") || "100",
        };
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
    const cachedData = await getCache(action || "unknown", cacheParams);
    if (cachedData) {
      console.log(`[API] Cache HIT para ${action}`);
      await logApiCall(req, action || "unknown", url, startTime, 200, cachedData, true);
      return buildResponse(action || "unknown", cachedData, 200);
    }

    // ==========================================
    // 2. Si no está en cache, consultar API externa
    // ==========================================
    const headers: Record<string, string> = {};
    if (url.includes("osirion.gg") && OSIRION_API_KEY) {
      headers["Authorization"] = `Bearer ${OSIRION_API_KEY}`;
    }
    if (action === "tracker-stats" && TRACKER_API_KEY) {
      headers["TRN-Api-Key"] = TRACKER_API_KEY;
    }
    if ((action === "fortnite-api-stats" || action === "shop") && FORTNITE_API_KEY) {
      headers["Authorization"] = FORTNITE_API_KEY;
    }

    let response: Response;
    let data: unknown;

    if (action === "player-tournament-placements") {
      const accountId = searchParams.get("accountId") || searchParams.get("epicIds") || "";
      const maxEvents = Math.max(1, Math.min(Number(searchParams.get("placementLimit") || searchParams.get("historyLimit") || 100), 200));
      const listResult = await fetchJson(url, headers);
      response = listResult.response;

      if (!response.ok) {
        data = listResult.data;
      } else {
        const firstPage = getTournaments(listResult.data);
        const tournaments = await fetchTournamentPages({
          accountId,
          headers,
          firstPage,
          initialUrl: url,
          maxEvents,
          season: searchParams.get("season"),
        });
        const placements = await mapLimit(tournaments, 6, async (tournament) => {
          const eventWindowId = typeof tournament.eventWindowId === "string" ? tournament.eventWindowId : "";
          if (!eventWindowId) return null;

          const params = new URLSearchParams({
            eventWindowId,
            epicIds: accountId,
            include: "points,eliminations,assists,avgPlacement",
            includeRanks: "true",
            orderBy: "points",
            orderByDescending: "true",
            fromIndex: "0",
            limit: "10",
          });
          if (typeof tournament.eventId === "string") params.set("eventId", tournament.eventId);

          try {
            const statsUrl = `${OSIRION_BASE}/tournaments/stats?${params.toString()}`;
            const statsResult = await fetchJson(statsUrl, headers);
            if (!statsResult.response.ok) {
              return {
                accountId,
                eventId: tournament.eventId || null,
                eventWindowId,
                error: `stats request failed: ${statsResult.response.status}`,
              };
            }

            const players = getPlayers(statsResult.data);
            const player = players.find((candidate) => {
              const epicId = candidate.epicId || candidate.accountId;
              return typeof epicId === "string" && epicId.toLowerCase() === accountId.toLowerCase();
            }) || players[0];

            return player ? normalizeTournamentPlacement(player, tournament, accountId) : {
              accountId,
              eventId: tournament.eventId || null,
              eventWindowId,
              placement: null,
              raw: null,
            };
          } catch (error) {
            return {
              accountId,
              eventId: tournament.eventId || null,
              eventWindowId,
              error: getErrorMessage(error),
            };
          }
        });

        const validPlacements = placements.filter(Boolean);
        data = {
          accountId,
          tournamentsScanned: tournaments.length,
          placements: validPlacements,
          source: {
            tournamentsUrl: url,
            statsEndpoint: `${OSIRION_BASE}/tournaments/stats`,
          },
        };
      }
    } else {
      const result = await fetchJson(url, headers);
      response = result.response;
      data = result.data;
    }

    // ==========================================
    // 3. Guardar en cache si la respuesta fue exitosa
    // ==========================================
    if (response.ok) {
      const ttl = getCacheTtl(action || "unknown");
      await setCache(action || "unknown", cacheParams, data, ttl);
    }

    // ==========================================
    // 4. Publicar evento en Kafka
    // ==========================================
    await logApiCall(req, action || "unknown", url, startTime, response.status, data, false);

    // ==========================================
    // 5. Construir respuesta (sin cache)
    // ==========================================
    if (action === "ranked-current" && response.ok) {
      const dataRecord = asRecord(data);
      const modes: RankedMode[] = Array.isArray(dataRecord.modes) ? dataRecord.modes as RankedMode[] : [];
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
        ranks: modes,
      });
    }

    if ((action === "tracker-stats" || action === "fortnite-api-stats") && response.ok) {
      return NextResponse.json({ success: true, cached: false, data });
    }

    if (action === "tournaments" && response.ok) {
      const dataRecord = asRecord(data);
      return NextResponse.json({ success: true, cached: false, tournaments: dataRecord.events || dataRecord.tournaments || data });
    }

    if (action === "leaderboard" && response.ok) {
      const dataRecord = asRecord(data);
      return NextResponse.json({ success: true, cached: false, leaderboard: dataRecord.leaderboard || data });
    }

    if (action === "tournament-player-stats" && response.ok) {
      return NextResponse.json({ success: true, cached: false, players: getPlayers(data), data });
    }

    if (action === "player-tournament-placements" && response.ok) {
      return NextResponse.json({ success: true, cached: false, ...(asRecord(data)) });
    }

    if (action === "shop" && response.ok) {
      const dataRecord = asRecord(data);
      return NextResponse.json({ success: true, cached: false, shop: dataRecord.data || data });
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
