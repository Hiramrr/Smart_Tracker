const express = require('express');
const cors = require('cors');
const multer = require('multer');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const parseReplay = require('./node_modules/fortnite-replay-parser');

const app = express();
app.use(cors());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }
});

const PORT = process.env.PORT || 7433;
const FORTNITE_API_KEY = process.env.FORTNITE_API_KEY || '';
const FORTNITE_API_BASE = process.env.FORTNITE_API_BASE || 'https://fortniteapi.io/v1';
let mapCache = { at: 0, data: null };

function msToTime(ms) {
  if (ms == null) return '00:00';
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function safeIso(ts) {
  try {
    if (!ts) return null;
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

function uniqueNames(values) {
  return [...new Set((values || []).filter(Boolean).map(v => String(v).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function collectPlayers(info, events, eliminations) {
  const found = [];
  const owner = info?.FriendlyName || info?.friendlyName || null;
  if (owner) found.push(owner);

  for (const e of eliminations) {
    if (e.eliminator) found.push(e.eliminator);
    if (e.eliminated) found.push(e.eliminated);
  }

  const keys = ['player', 'playerName', 'player_name', 'owner', 'ownerName', 'instigator', 'instigatorName', 'eliminator', 'eliminated'];
  for (const evt of (events || [])) {
    for (const key of keys) {
      if (typeof evt?.[key] === 'string') found.push(evt[key]);
    }
  }

  return uniqueNames(found);
}

function requestJson(urlString, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method: 'GET', headers }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error('Invalid JSON from Fortnite API'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getFortniteMap() {
  const now = Date.now();
  if (mapCache.data && now - mapCache.at < 10 * 60 * 1000) return mapCache.data;

  if (!FORTNITE_API_KEY) {
    const out = {
      enabled: false,
      provider: 'fortniteapi.io',
      error: 'Falta FORTNITE_API_KEY en el backend',
      selected: null
    };
    mapCache = { at: now, data: out };
    return out;
  }

  const json = await requestJson(`${FORTNITE_API_BASE}/map?lang=es`, {
    Authorization: FORTNITE_API_KEY
  });

  const selected = {
    name: json?.season ? `Temporada ${json.season}` : 'Mapa actual',
    patch: json?.patchVersion || json?.season || null,
    url: json?.image || json?.images?.blank || null
  };

  const out = {
    enabled: true,
    provider: 'fortniteapi.io',
    selected,
    raw: json
  };
  mapCache = { at: now, data: out };
  return out;
}

function pipeRemoteImage(urlString, res) {
  const url = new URL(urlString);
  const lib = url.protocol === 'https:' ? https : http;
  const req = lib.request(url, remote => {
    if (remote.statusCode < 200 || remote.statusCode >= 300) {
      res.status(remote.statusCode || 502).json({ error: 'No se pudo descargar la imagen del mapa' });
      return;
    }
    res.setHeader('Content-Type', remote.headers['content-type'] || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    remote.pipe(res);
  });
  req.on('error', err => res.status(502).json({ error: err.message }));
  req.end();
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/map-meta', async (req, res) => {
  try {
    const map = await getFortniteMap();
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/map-image', async (req, res) => {
  try {
    const map = await getFortniteMap();
    const imageUrl = map?.selected?.url;
    if (!imageUrl) return res.status(404).json({ error: 'Mapa no disponible' });
    pipeRemoteImage(imageUrl, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/parse', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  if (!req.file.originalname.toLowerCase().endsWith('.replay')) {
    return res.status(400).json({ error: 'Must be a .replay file' });
  }

  try {
    const parsed = await parseReplay(req.file.buffer, { parseEvents: true, parsePackets: false });
    const info = parsed?.info || {};
    const allEvents = parsed?.events || [];

    const eliminations = allEvents
      .filter(e => e.group === 'playerElim')
      .map(e => ({
        start_time: e.startTime ?? null,
        start_time_str: msToTime(e.startTime),
        eliminated: e.eliminated ?? null,
        eliminator: e.eliminator ?? null,
        gun_type: e.gunType ?? null,
        knocked: e.knocked ?? false
      }));

    const matchStats = allEvents.find(e => e.metadata === 'AthenaMatchStats');
    const teamStats = allEvents.find(e => e.metadata === 'AthenaMatchTeamStats');

    const lengthMs = info.LengthInMs ?? 0;
    const placement = teamStats?.position ?? null;
    const totalPlayers = teamStats?.totalPlayers ?? null;
    const owner = info.FriendlyName ?? null;
    const players = collectPlayers(info, allEvents, eliminations);

    let map = null;
    try {
      map = await getFortniteMap();
    } catch (err) {
      map = {
        enabled: false,
        provider: 'fortniteapi.io',
        error: err.message,
        selected: null
      };
    }

    const summary = {
      duration: msToTime(lengthMs),
      duration_ms: lengthMs,
      friendly_name: info.FriendlyName ?? 'Replay',
      owner,
      timestamp: safeIso(info.Timestamp),
      total_eliminations: eliminations.length,
      placement,
      total_players: totalPlayers,
      players_found: players.length
    };

    const match_stats = {
      placement,
      total_players: totalPlayers,
      eliminations: matchStats?.eliminations ?? eliminations.length,
      assists: matchStats?.assists ?? null,
      accuracy: matchStats?.accuracy != null ? Math.round(matchStats.accuracy * 100) : null,
      weapon_damage: matchStats?.weaponDamage ?? null,
      other_damage: matchStats?.otherDamage ?? null,
      damage_to_players: matchStats?.damageToPlayers ?? null,
      revives: matchStats?.revives ?? null,
      damage_taken: matchStats?.damageTaken ?? null,
      damage_to_structures: matchStats?.damageToStructures ?? null,
      materials_gathered: matchStats?.materialsGathered ?? null,
      materials_used: matchStats?.materialsUsed ?? null,
      total_traveled: matchStats?.totalTraveled ?? null
    };

    res.json({
      summary,
      match_stats,
      players,
      map: {
        ...map,
        proxy_url: map?.selected?.url ? '/map-image' : null
      },
      eliminations
    });
  } catch (err) {
    console.error('Parse error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Fortnite Replay API → http://localhost:${PORT}`));
