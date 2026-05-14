const express = require("express");
const cors = require("cors");
const multer = require("multer");
const parseReplay = require("./node_modules/fortnite-replay-parser");

const app = express();
app.use(cors());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
});
const FORTNITE_API_KEY = "949d097e-6d80-4676-b676-e555bbe42401";
const FORTNITE_API_BASE = "https://fortnite-api.com/v2";

const playerCache = new Map();
const MAX_CONCURRENT = 2; // Keep conservative
let activeRequests = 0;
const queue = [];
function enqueue(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    processQueue();
  });
}
function processQueue() {
  if (activeRequests >= MAX_CONCURRENT || queue.length === 0) return;
  const { task, resolve, reject } = queue.shift();
  activeRequests++;
  task()
    .then(resolve)
    .catch(reject)
    .finally(() => {
      activeRequests--;
      processQueue();
    });
}

async function requestJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Error ${response.status} for ${url}: ${errorText}`);
    throw new Error(`API Error: ${response.status}`);
  }
  return response.json();
}

async function resolvePlayerName(accountId) {
  if (!accountId) return null;
  // si ya está cacheado
  if (playerCache.has(accountId)) {
    return playerCache.get(accountId);
  }
  // si no tienes API key, regresa el ID
  if (!FORTNITE_API_KEY) return accountId;

  // Rate limiting delay
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    console.log(`Resolving player via fortnite-api.com: ${accountId}`);
    // Correct endpoint: https://fortnite-api.com/v2/stats/br/v2/{accountId}
    const data = await enqueue(() =>
      requestJson(
        `${FORTNITE_API_BASE}/stats/br/v2/${encodeURIComponent(accountId)}`,
        { Authorization: FORTNITE_API_KEY }
      )
    );
    
    // Correct path to name: data.data.account.name
    // If the API returns a name, use it. If not, use the accountId.
    const name = data?.data?.account?.name || accountId;
    
    console.log(`Resolved player ${accountId} to: ${name}`);
    playerCache.set(accountId, name);
    return name;
  } catch (err) {
    console.error(`Error resolving player ${accountId}:`, err.message);
    // Even if it fails, we keep the ID as fallback
    return accountId;
  }
}

function msToTime(ms) {
  if (ms == null) return "00:00";
  const s = Math.floor(ms / 1000);
  return (
    String(Math.floor(s / 60)).padStart(2, "0") +
    ":" +
    String(s % 60).padStart(2, "0")
  );
}

function safeIso(ts) {
  try {
    return ts ? new Date(ts).toISOString() : null;
  } catch {
    return null;
  }
}

function uniqueNames(names) {
  return [
    ...new Set(
      (names || [])
        .filter(Boolean)
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function collectPlayers(parsed, eliminations, ownerName) {
  const found = [];

  // Owner del replay (jugador principal)
  if (ownerName) found.push(ownerName);

  for (const elim of eliminations) {
    if (elim.eliminator) found.push(elim.eliminator);
    if (elim.eliminated) found.push(elim.eliminated);
  }

  const events = parsed?.events || [];
  for (const evt of events) {
    const candidateKeys = [
      "player",
      "playerName",
      "player_name",
      "owner",
      "ownerName",
      "instigator",
      "instigatorName",
      "eliminator",
      "eliminated",
    ];
    for (const key of candidateKeys) {
      if (typeof evt?.[key] === "string") found.push(evt[key]);
    }
  }

  const unique = uniqueNames(found);
  console.log("Jugadores extraídos por el parser (incluyendo owner):", unique);
  return unique;
}

function collectReplayPositions(parsed) {
  const events = parsed?.events || [];
  const points = [];

  for (const evt of events) {
    const hasCoords = [evt?.x, evt?.y, evt?.z].some(
      (v) => typeof v === "number",
    );
    const actor =
      evt?.playerName ||
      evt?.player ||
      evt?.ownerName ||
      evt?.instigatorName ||
      evt?.eliminator ||
      evt?.eliminated ||
      null;
    const time = evt?.startTime ?? evt?.time ?? null;

    if (hasCoords) {
      points.push({
        t: typeof time === "number" ? time : null,
        x: typeof evt?.x === "number" ? evt.x : null,
        y: typeof evt?.y === "number" ? evt.y : null,
        z: typeof evt?.z === "number" ? evt.z : null,
        player: actor,
        source: evt?.group || evt?.metadata || "event",
      });
    }
  }

  return points;
}

async function getFortniteMap() {
  if (!FORTNITE_API_KEY) {
    return {
      enabled: false,
      provider: "fortniteapi.io",
      error: "Falta FORTNITE_API_KEY en el backend",
    };
  }

  const url = `${FORTNITE_API_BASE}/map?lang=es`;
  const response = await fetch(url, {
    headers: { Authorization: FORTNITE_API_KEY },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fortnite API ${response.status}: ${text.slice(0, 160)}`);
  }

  const json = await response.json();

  // fortniteapi.io /v1/map devuelve { image, pois, ... }
  const imageUrl = json?.image || json?.images?.blank || null;
  const patch = json?.season || json?.patchVersion || null;

  return {
    enabled: true,
    provider: "fortniteapi.io",
    selected: {
      name: patch ? `Temporada ${patch}` : "Mapa actual",
      patch,
      url: imageUrl,
    },
  };
}

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/parse", upload.single("file"), async (req, res) => {
  console.log("--- Request received: /parse ---");
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  if (!req.file.originalname.endsWith(".replay"))
    return res.status(400).json({ error: "Must be a .replay file" });

  try {
    const parsed = await parseReplay(req.file.buffer, {
      parseEvents: true,
      parsePackets: false,
    });
    const info = parsed.info || {};
    const allEvents = parsed.events || [];

    const eliminations = allEvents
      .filter((e) => e.group === "playerElim")
      .map((e) => ({
        start_time: e.startTime ?? null,
        start_time_str: msToTime(e.startTime),
        eliminated: e.eliminated ?? null,
        eliminator: e.eliminator ?? null,
        gun_type: e.gunType ?? null,
        knocked: e.knocked ?? false,
        x: typeof e?.x === "number" ? e.x : null,
        y: typeof e?.y === "number" ? e.y : null,
        z: typeof e?.z === "number" ? e.z : null,
      }));

    const matchStats = allEvents.find((e) => e.metadata === "AthenaMatchStats");
    const teamStats = allEvents.find(
      (e) => e.metadata === "AthenaMatchTeamStats",
    );

    const lengthMs = info.LengthInMs ?? 0;
    const placement = teamStats?.position ?? null;
    const totalPlayers = teamStats?.totalPlayers ?? null;
    
    // Use FriendlyName only if it's not a generic placeholder
    const ownerName = (info.FriendlyName && info.FriendlyName !== "Unsaved Replay") ? info.FriendlyName : null;
    const players = collectPlayers(parsed, eliminations, ownerName);
    
    // Resolver nombres
    const playersWithNames = await Promise.all(
      players.map(async (id) => {
        try {
          const resolvedName = await resolvePlayerName(id);
          return { id, name: resolvedName || id };
        } catch (e) {
          return { id, name: id };
        }
      })
    );

    // Map ID to Name for elimination feed
    const nameMap = new Map(playersWithNames.map(p => [p.id, p.name]));
    
    const eliminationsWithNames = eliminations.map(e => ({
        ...e,
        eliminator: nameMap.get(e.eliminator) || e.eliminator,
        eliminated: nameMap.get(e.eliminated) || e.eliminated
    }));

    const replayPositions = collectReplayPositions(parsed);

    let map = null;
    try {
      map = await getFortniteMap();
    } catch (mapErr) {
      map = {
        enabled: true,
        provider: "fortniteapi.io",
        error: mapErr.message,
      };
    }

    const summary = {
      duration: msToTime(lengthMs),
      duration_ms: lengthMs,
      friendly_name: info.FriendlyName ?? "Replay",
      owner: ownerName,
      timestamp: safeIso(info.Timestamp),
      total_eliminations: eliminations.length,
      placement,
      total_players: totalPlayers,
      players_found: players.length,
    };

    const match_stats = {
      placement,
      total_players: totalPlayers,
      eliminations: matchStats?.eliminations ?? eliminations.length,
      assists: matchStats?.assists ?? null,
      accuracy:
        matchStats?.accuracy != null
          ? Math.round(matchStats.accuracy * 100)
          : null,
      weapon_damage: matchStats?.weaponDamage ?? null,
      other_damage: matchStats?.otherDamage ?? null,
      damage_to_players: matchStats?.damageToPlayers ?? null,
      revives: matchStats?.revives ?? null,
      damage_taken: matchStats?.damageTaken ?? null,
      damage_to_structures: matchStats?.damageToStructures ?? null,
      materials_gathered: matchStats?.materialsGathered ?? null,
      materials_used: matchStats?.materialsUsed ?? null,
      total_traveled: matchStats?.totalTraveled ?? null,
    };

    res.json({
      summary,
      match_stats,
      players: playersWithNames,
      map,
      replay_positions: replayPositions,
      eliminations: eliminationsWithNames,
    });
  } catch (err) {
    console.error("Parse error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(7433, () =>
  console.log("Fortnite Replay API → http://localhost:7433"),
);
