import { query, getCache, setCache, getCacheTtl } from "@/lib/db";

const RIOT_API_KEY = process.env.RIOT_API_KEY || process.env.RGAPI_KEY;
const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";

export const PLATFORM_ROUTES = [
  "br1",
  "eun1",
  "euw1",
  "jp1",
  "kr",
  "la1",
  "la2",
  "na1",
  "oc1",
  "tr1",
  "ru",
  "ph2",
  "sg2",
  "th2",
  "tw2",
  "vn2",
] as const;

export const REGIONAL_ROUTES = ["americas", "asia", "europe", "sea"] as const;

type JsonRecord = Record<string, unknown>;

export type RiotOverview = {
  account: JsonRecord;
  summoner: JsonRecord | null;
  ranked: JsonRecord[];
  mastery: JsonRecord[];
  matches: JsonRecord[];
  recentMatches: JsonRecord[];
  matchIds: string[];
  champions: JsonRecord;
  analysis: JsonRecord;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function requireRiotKey() {
  if (!RIOT_API_KEY) {
    throw new Error("RIOT_API_KEY no configurada");
  }
  return RIOT_API_KEY;
}

function normalizePlatform(route: string | null | undefined) {
  const value = (route || "la1").toLowerCase();
  return PLATFORM_ROUTES.includes(value as (typeof PLATFORM_ROUTES)[number]) ? value : "la1";
}

function normalizeRegional(route: string | null | undefined) {
  const value = (route || "americas").toLowerCase();
  return REGIONAL_ROUTES.includes(value as (typeof REGIONAL_ROUTES)[number]) ? value : "americas";
}

async function fetchRiot(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "X-Riot-Token": requireRiotKey(),
    },
  });

  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message = asRecord(asRecord(payload).status).message || asRecord(payload).message;
    throw new Error(`Riot API ${response.status}: ${String(message || "request failed")}`);
  }

  return payload;
}

async function cached<T>(action: string, params: Record<string, unknown>, loader: () => Promise<T>): Promise<T> {
  const cachedData = await getCache(action, params);
  if (cachedData) return cachedData as T;

  const data = await loader();
  await setCache(action, params, data, getCacheTtl(action));
  return data;
}

export async function logRiotApiCall(options: {
  action: string;
  parameters: Record<string, unknown>;
  endpointUrl: string;
  status: number;
  durationMs: number;
  responseBody: unknown;
  sourceIp?: string;
  userAgent?: string;
}) {
  try {
    const responseBody = options.responseBody ?? null;
    const responseSize = Buffer.byteLength(JSON.stringify(responseBody), "utf8");
    await query(
      `INSERT INTO api_calls (
         action, parameters, source_ip, user_agent, response_status,
         response_size, duration_ms, api_source, endpoint_url, response_body
       )
       VALUES ($1, $2, NULLIF($3, '')::inet, $4, $5, $6, $7, $8, $9, $10)`,
      [
        options.action,
        JSON.stringify(options.parameters),
        options.sourceIp || null,
        options.userAgent || null,
        options.status,
        responseSize,
        options.durationMs,
        "riot",
        options.endpointUrl,
        JSON.stringify(responseBody),
      ]
    );
  } catch (error) {
    console.warn("[Riot] No se pudo registrar api_call:", error);
  }
}

export async function getRiotAccountByRiotId(gameName: string, tagLine: string, regionalRoute = "americas") {
  const route = normalizeRegional(regionalRoute);
  const url = `https://${route}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return cached("lol-account", { gameName, tagLine, regionalRoute: route }, () => fetchRiot(url)) as Promise<JsonRecord>;
}

export async function getLolSummonerByPuuid(puuid: string, platformRoute = "la1") {
  const route = normalizePlatform(platformRoute);
  const url = `https://${route}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
  return cached("lol-profile", { puuid, platformRoute: route }, () => fetchRiot(url)) as Promise<JsonRecord>;
}

export async function getLolRankedEntries(encryptedSummonerId: string, platformRoute = "la1") {
  const route = normalizePlatform(platformRoute);
  const url = `https://${route}.api.riotgames.com/lol/league/v4/entries/by-summoner/${encodeURIComponent(encryptedSummonerId)}`;
  return cached("lol-ranked", { encryptedSummonerId, platformRoute: route }, async () => asArray(await fetchRiot(url)));
}

export async function getLolRankedEntriesByPuuid(puuid: string, platformRoute = "la1") {
  const route = normalizePlatform(platformRoute);
  const url = `https://${route}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;
  return cached("lol-ranked", { puuid, platformRoute: route }, async () => asArray(await fetchRiot(url)));
}

export async function getLolChampionMastery(puuid: string, platformRoute = "la1", limit = 8) {
  const route = normalizePlatform(platformRoute);
  const safeLimit = clamp(limit, 1, 25);
  const url = `https://${route}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}/top?count=${safeLimit}`;
  return cached("lol-mastery", { puuid, platformRoute: route, limit: safeLimit }, async () => asArray(await fetchRiot(url)));
}

export async function getLolMatchIds(puuid: string, regionalRoute = "americas", count = 8) {
  const route = normalizeRegional(regionalRoute);
  const safeCount = clamp(count, 1, 20);
  const url = `https://${route}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${safeCount}`;
  return cached("lol-matches", { puuid, regionalRoute: route, count: safeCount }, async () => {
    const payload = await fetchRiot(url);
    return Array.isArray(payload) ? payload.filter((item): item is string => typeof item === "string") : [];
  });
}

export async function getLolMatch(matchId: string, regionalRoute = "americas") {
  const route = normalizeRegional(regionalRoute);
  const url = `https://${route}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
  return cached("lol-match", { matchId, regionalRoute: route }, () => fetchRiot(url)) as Promise<JsonRecord>;
}

export async function getDdragonChampions(language = "es_MX") {
  const lang = language || "es_MX";
  return cached("lol-static-champions", { language: lang }, async () => {
    const versionsResponse = await fetch(`${DDRAGON_BASE}/api/versions.json`);
    if (!versionsResponse.ok) throw new Error(`Data Dragon versions ${versionsResponse.status}`);
    const versions = (await versionsResponse.json()) as string[];
    const version = versions[0];
    const championsResponse = await fetch(`${DDRAGON_BASE}/cdn/${version}/data/${lang}/champion.json`);
    if (!championsResponse.ok) throw new Error(`Data Dragon champions ${championsResponse.status}`);
    const championPayload = asRecord(await championsResponse.json());
    const data = asRecord(championPayload.data);
    const byKey: JsonRecord = {};

    for (const champion of Object.values(data).map(asRecord)) {
      const key = String(champion.key || "");
      if (!key) continue;
      byKey[key] = {
        id: champion.id,
        key,
        name: champion.name,
        title: champion.title,
        image: `${DDRAGON_BASE}/cdn/${version}/img/champion/${asRecord(champion.image).full || `${champion.id}.png`}`,
      };
    }

    return { version, language: lang, byKey };
  }) as Promise<JsonRecord>;
}

function findParticipant(match: JsonRecord, puuid: string) {
  const normalizedPuuid = puuid.toLowerCase();
  const participants = asArray(asRecord(match.info).participants);
  return participants.find((participant) => String(participant.puuid || "").toLowerCase() === normalizedPuuid) || null;
}

function normalizeRecentMatches(puuid: string, matches: JsonRecord[], champions: JsonRecord) {
  const championMap = asRecord(champions.byKey);
  const recentMatches: JsonRecord[] = [];

  for (const match of matches) {
    if (match.error) continue;
    const metadata = asRecord(match.metadata);
    const info = asRecord(match.info);
    const participant = findParticipant(match, puuid);
    if (!participant) continue;
    const championId = String(participant.championId || "");
    const staticChampion = asRecord(championMap[championId]);
    const cs = asNumber(participant.totalMinionsKilled) + asNumber(participant.neutralMinionsKilled);
    const kills = asNumber(participant.kills);
    const deaths = asNumber(participant.deaths);
    const assists = asNumber(participant.assists);

    recentMatches.push({
      matchId: metadata.matchId || null,
      gameCreation: info.gameCreation || null,
      gameDuration: info.gameDuration || participant.timePlayed || null,
      queueId: info.queueId || null,
      championId,
      championName: staticChampion.name || participant.championName || championId,
      championImage: staticChampion.image || null,
      win: participant.win === true,
      kills,
      deaths,
      assists,
      kda: deaths ? Math.round(((kills + assists) / deaths) * 100) / 100 : kills + assists,
      cs,
      gold: asNumber(participant.goldEarned),
      lane: participant.teamPosition || participant.individualPosition || participant.lane || null,
    });
  }

  return recentMatches;
}

function summarizeMatches(puuid: string, matches: JsonRecord[], champions: JsonRecord) {
  const championMap = asRecord(champions.byKey);
  const participants = matches
    .map((match) => findParticipant(match, puuid))
    .filter((participant): participant is JsonRecord => Boolean(participant));
  const wins = participants.filter((participant) => participant.win === true).length;
  const totals = participants.reduce<{ kills: number; deaths: number; assists: number; gold: number; cs: number }>(
    (acc, participant) => ({
      kills: acc.kills + asNumber(participant.kills),
      deaths: acc.deaths + asNumber(participant.deaths),
      assists: acc.assists + asNumber(participant.assists),
      gold: acc.gold + asNumber(participant.goldEarned),
      cs: acc.cs + asNumber(participant.totalMinionsKilled) + asNumber(participant.neutralMinionsKilled),
    }),
    { kills: 0, deaths: 0, assists: 0, gold: 0, cs: 0 }
  );
  const championCounts = new Map<string, { championId: string; championName: string; games: number; wins: number }>();

  for (const participant of participants) {
    const championId = String(participant.championId || "");
    const staticChampion = asRecord(championMap[championId]);
    const championName = String(staticChampion.name || participant.championName || championId);
    const current = championCounts.get(championId) || { championId, championName, games: 0, wins: 0 };
    current.games += 1;
    if (participant.win === true) current.wins += 1;
    championCounts.set(championId, current);
  }

  return {
    matchesAnalyzed: participants.length,
    wins,
    losses: Math.max(0, participants.length - wins),
    winRate: participants.length ? Math.round((wins / participants.length) * 1000) / 10 : 0,
    avgKills: participants.length ? Math.round((totals.kills / participants.length) * 10) / 10 : 0,
    avgDeaths: participants.length ? Math.round((totals.deaths / participants.length) * 10) / 10 : 0,
    avgAssists: participants.length ? Math.round((totals.assists / participants.length) * 10) / 10 : 0,
    kda: totals.deaths ? Math.round(((totals.kills + totals.assists) / totals.deaths) * 100) / 100 : totals.kills + totals.assists,
    avgGold: participants.length ? Math.round(totals.gold / participants.length) : 0,
    avgCs: participants.length ? Math.round(totals.cs / participants.length) : 0,
    championPool: Array.from(championCounts.values()).sort((a, b) => b.games - a.games),
  };
}

export async function getLolOverview(options: {
  gameName: string;
  tagLine: string;
  platformRoute?: string;
  regionalRoute?: string;
  matchCount?: number;
}) {
  const platformRoute = normalizePlatform(options.platformRoute);
  const regionalRoute = normalizeRegional(options.regionalRoute);
  const matchCount = clamp(options.matchCount || 8, 1, 20);

  const account = await getRiotAccountByRiotId(options.gameName, options.tagLine, regionalRoute);
  const puuid = String(account.puuid || "");
  if (!puuid) throw new Error("Riot no regreso PUUID para ese Riot ID");

  const summoner = await getLolSummonerByPuuid(puuid, platformRoute).catch((error) => {
    console.warn("[Riot] Summoner no disponible:", error);
    return null;
  });
  const encryptedSummonerId = String(summoner?.id || "");

  const [ranked, mastery, matchIds, champions] = await Promise.all([
    getLolRankedEntriesByPuuid(puuid, platformRoute).catch((error) => {
      console.warn("[Riot] Ranked por PUUID no disponible:", error);
      return encryptedSummonerId ? getLolRankedEntries(encryptedSummonerId, platformRoute) : [];
    }),
    getLolChampionMastery(puuid, platformRoute, 8),
    getLolMatchIds(puuid, regionalRoute, matchCount),
    getDdragonChampions("es_MX"),
  ]);

  const matches = await Promise.all(
    matchIds.slice(0, 8).map((matchId) =>
      getLolMatch(matchId, regionalRoute).catch((error) => ({
        metadata: { matchId },
        error: error instanceof Error ? error.message : "match no disponible",
      }))
    )
  );

  const overview: RiotOverview = {
    account,
    summoner,
    ranked,
    mastery,
    matchIds,
    matches,
    recentMatches: normalizeRecentMatches(puuid, matches, champions),
    champions,
    analysis: summarizeMatches(puuid, matches, champions),
  };

  await persistLolOverview(overview, { platformRoute, regionalRoute });
  return overview;
}

async function persistLolOverview(overview: RiotOverview, routes: { platformRoute: string; regionalRoute: string }) {
  const account = overview.account;
  const puuid = String(account.puuid || "");
  const summoner = overview.summoner;
  if (!puuid) return;

  try {
    await query(
      `INSERT INTO lol_player_snapshots (
         puuid, game_name, tag_line, platform, regional_route, summoner_id,
         summoner_level, profile_icon_id, ranked_data, mastery_data, analysis, raw_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        puuid,
        account.gameName || null,
        account.tagLine || null,
        routes.platformRoute,
        routes.regionalRoute,
        summoner?.id || null,
        summoner?.summonerLevel || null,
        summoner?.profileIconId || null,
        JSON.stringify(overview.ranked),
        JSON.stringify(overview.mastery),
        JSON.stringify(overview.analysis),
        JSON.stringify({ account, summoner }),
      ]
    );

    for (const match of overview.matches) {
      const metadata = asRecord(match.metadata);
      const info = asRecord(match.info);
      const matchId = String(metadata.matchId || "");
      if (!matchId || match.error) continue;
      await query(
        `INSERT INTO lol_match_snapshots (match_id, puuid, game_creation, game_duration, queue_id, raw_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (match_id, puuid)
         DO UPDATE SET raw_json = EXCLUDED.raw_json, captured_at = NOW()`,
        [
          matchId,
          puuid,
          info.gameCreation ? new Date(asNumber(info.gameCreation)).toISOString() : null,
          asNumber(info.gameDuration) || null,
          asNumber(info.queueId) || null,
          JSON.stringify(match),
        ]
      );
    }
  } catch (error) {
    console.warn("[Riot] No se pudo persistir snapshot LoL:", error);
  }
}
