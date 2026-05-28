import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getPool } from "@/lib/db";
import { ensureDatabaseInitialized } from "@/lib/init";

const execFileAsync = promisify(execFile);

const DEFAULT_PARSER_SCRIPT = path.join(process.cwd(), "tools/csharp-parser/run.sh");

const MAX_REPLAY_BYTES = 120 * 1024 * 1024;

export const runtime = "nodejs";

type ReplayMatch = {
  replayId: string;
  fileName: string;
  startedAt?: string | null;
  duration?: string | null;
  durationSeconds?: number | null;
  playlist?: string | null;
  localPlayerId?: string | null;
  playerName?: string | null;
  statsSource?: string | null;
  totalPlayers?: number | null;
  placement?: number | null;
  displayEliminations?: number | null;
  displayTeamEliminations?: number | null;
  displayDeaths?: number | null;
  damageToPlayers?: number | null;
  damageFromPlayers?: number | null;
  playerDamageRatio?: number | null;
  accuracyPercent?: number | null;
  assists?: number | null;
  revives?: number | null;
  materialsGathered?: number | null;
  materialsUsed?: number | null;
  totalTraveled?: number | null;
  eventEliminations?: number | null;
  killFeedEvents?: number | null;
  playerRows?: number | null;
  teamRows?: number | null;
  associatedPlayer?: {
    displayName: string;
    playerId: string | null;
    source: "parser" | "manual";
  };
};

type ParserReplayMatch = Record<string, string | number | null | undefined>;

function getParserScriptPath() {
  const configuredPath = process.env.FORTNITE_REPLAY_CSHARP_PARSER?.trim();
  const parserPath = configuredPath || DEFAULT_PARSER_SCRIPT;

  return parserPath.replace(/^['"]|['"]$/g, "");
}

async function assertParserExists(parserScript: string) {
  try {
    await access(parserScript, constants.R_OK);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "EACCES") {
      throw new Error(
        `No tengo permiso para leer el parser C# en ${parserScript}. Mueve el parser al proyecto o concede permisos al proceso de Next.`,
      );
    }

    throw new Error(
      `No encontre el parser C# en ${parserScript}. Configura FORTNITE_REPLAY_CSHARP_PARSER con la ruta real de run.sh.`,
    );
  }
}

function field<T extends string | number | null | undefined>(
  match: ParserReplayMatch,
  camelKey: string,
  pascalKey: string,
) {
  return (match[camelKey] ?? match[pascalKey] ?? null) as T | null;
}

function numberField(match: ParserReplayMatch, camelKey: string, pascalKey: string) {
  const value = field<string | number>(match, camelKey, pascalKey);
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerField(match: ParserReplayMatch, camelKey: string, pascalKey: string) {
  const number = numberField(match, camelKey, pascalKey);
  return number === null ? null : Math.round(number);
}

function normalizeMatch(match: ParserReplayMatch): ReplayMatch {
  return {
    replayId: field<string>(match, "replayId", "ReplayId") ?? randomUUID(),
    fileName: field<string>(match, "fileName", "FileName") ?? "replay.replay",
    startedAt: field<string>(match, "startedAt", "StartedAt"),
    duration: field<string>(match, "duration", "Duration"),
    durationSeconds: numberField(match, "durationSeconds", "DurationSeconds"),
    playlist: field<string>(match, "playlist", "Playlist"),
    localPlayerId: field<string>(match, "localPlayerId", "LocalPlayerId"),
    playerName: field<string>(match, "playerName", "PlayerName"),
    statsSource: field<string>(match, "statsSource", "StatsSource"),
    totalPlayers: integerField(match, "totalPlayers", "TotalPlayers"),
    placement:
      integerField(match, "placement", "Placement") ??
      integerField(match, "playerDataPlacement", "PlayerDataPlacement") ??
      integerField(match, "teamDataPlacement", "TeamDataPlacement"),
    displayEliminations: integerField(match, "displayEliminations", "DisplayEliminations"),
    displayTeamEliminations: integerField(match, "displayTeamEliminations", "DisplayTeamEliminations"),
    displayDeaths: integerField(match, "displayDeaths", "DisplayDeaths"),
    damageToPlayers: integerField(match, "damageToPlayers", "DamageToPlayers"),
    damageFromPlayers: integerField(match, "damageFromPlayers", "DamageFromPlayers"),
    playerDamageRatio: numberField(match, "playerDamageRatio", "PlayerDamageRatio"),
    accuracyPercent: numberField(match, "accuracyPercent", "AccuracyPercent"),
    assists: integerField(match, "assists", "Assists"),
    revives: integerField(match, "revives", "Revives"),
    materialsGathered: integerField(match, "materialsGathered", "MaterialsGathered"),
    materialsUsed: integerField(match, "materialsUsed", "MaterialsUsed"),
    totalTraveled: numberField(match, "totalTraveled", "TotalTraveled"),
    eventEliminations: integerField(match, "eventEliminations", "EventEliminations"),
    killFeedEvents: integerField(match, "killFeedEvents", "KillFeedEvents"),
    playerRows: integerField(match, "playerRows", "PlayerRows"),
    teamRows: integerField(match, "teamRows", "TeamRows"),
  };
}

function cleanPlayerId(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function cleanDisplayName(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 80);
}

function toNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function average(values: Array<number | null | undefined>) {
  const validValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (validValues.length === 0) {
    return null;
  }

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function summarize(matches: ReplayMatch[]) {
  const totalMatches = matches.length;
  const wins = matches.filter((match) => (match.placement ?? 0) === 1).length;
  const kills = matches.reduce((sum, match) => sum + toNumber(match.displayEliminations), 0);
  const deaths = matches.reduce((sum, match) => sum + toNumber(match.displayDeaths), 0);
  const damageToPlayers = matches.reduce((sum, match) => sum + toNumber(match.damageToPlayers), 0);
  const damageFromPlayers = matches.reduce((sum, match) => sum + toNumber(match.damageFromPlayers), 0);

  return {
    totalMatches,
    wins,
    kills,
    deaths,
    kd: deaths > 0 ? kills / deaths : kills,
    averageKills: totalMatches > 0 ? kills / totalMatches : 0,
    averagePlacement: average(matches.map((match) => match.placement)),
    damageToPlayers,
    damageFromPlayers,
    averageDamage: totalMatches > 0 ? damageToPlayers / totalMatches : 0,
    averageAccuracy: average(matches.map((match) => match.accuracyPercent)),
  };
}

async function persistReplays(matches: ReplayMatch[], responseBody: Record<string, unknown>) {
  if (matches.length === 0) return;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const match of matches) {
      await client.query(
        `
        INSERT INTO fortnite_replays (
          replay_id, file_name, display_name, player_id, stats_source,
          playlist, started_at, duration_seconds, total_players,
          placement, eliminations, team_eliminations, deaths,
          damage_to_players, damage_from_players, accuracy_percent,
          assists, revives, materials_gathered, materials_used,
          total_traveled, event_eliminations, kill_feed_events,
          associated_source, raw_match
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
        ON CONFLICT (replay_id, player_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          stats_source = EXCLUDED.stats_source,
          playlist = EXCLUDED.playlist,
          started_at = EXCLUDED.started_at,
          duration_seconds = EXCLUDED.duration_seconds,
          total_players = EXCLUDED.total_players,
          placement = EXCLUDED.placement,
          eliminations = EXCLUDED.eliminations,
          team_eliminations = EXCLUDED.team_eliminations,
          deaths = EXCLUDED.deaths,
          damage_to_players = EXCLUDED.damage_to_players,
          damage_from_players = EXCLUDED.damage_from_players,
          accuracy_percent = EXCLUDED.accuracy_percent,
          assists = EXCLUDED.assists,
          revives = EXCLUDED.revives,
          materials_gathered = EXCLUDED.materials_gathered,
          materials_used = EXCLUDED.materials_used,
          total_traveled = EXCLUDED.total_traveled,
          event_eliminations = EXCLUDED.event_eliminations,
          kill_feed_events = EXCLUDED.kill_feed_events,
          associated_source = EXCLUDED.associated_source,
          raw_match = EXCLUDED.raw_match,
          created_at = NOW()
        `,
        [
          match.replayId,
          match.fileName,
          match.associatedPlayer?.displayName ?? null,
          (match.localPlayerId || match.associatedPlayer?.playerId) ?? null,
          match.statsSource,
          match.playlist,
          match.startedAt ? new Date(match.startedAt) : null,
          match.durationSeconds,
          match.totalPlayers,
          match.placement,
          match.displayEliminations,
          match.displayTeamEliminations,
          match.displayDeaths,
          match.damageToPlayers,
          match.damageFromPlayers,
          match.accuracyPercent,
          match.assists,
          match.revives,
          match.materialsGathered,
          match.materialsUsed,
          match.totalTraveled,
          match.eventEliminations,
          match.killFeedEvents,
          match.associatedPlayer?.source ?? "manual",
          JSON.stringify(match),
        ],
      );
    }

    // Insertar en api_calls para que el outbox trigger envíe a Kafka
    await client.query(
      `
      INSERT INTO api_calls (
        id, action, parameters, source_ip, user_agent,
        response_status, response_size, duration_ms,
        api_source, endpoint_url, response_body
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        randomUUID(),
        "fortnite-replay-parse",
        JSON.stringify({ matchCount: matches.length }),
        null,
        null,
        200,
        JSON.stringify(responseBody).length,
        0,
        "fortnite-replay-parser",
        "/api/replays/fortnite",
        JSON.stringify(responseBody),
      ],
    );

    await client.query("COMMIT");
    console.log(`[Replays] Persistidos ${matches.length} matches en fortnite_replays`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Replays] Error persistiendo replays:", error);
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  await ensureDatabaseInitialized();

  const workspace = await mkdtemp(path.join(tmpdir(), "miyu-fortnite-replays-"));
  const inputDir = path.join(workspace, "input");
  const outputDir = path.join(workspace, "output");

  try {
    const formData = await request.formData();
    const displayName = cleanDisplayName(formData.get("displayName"));
    const playerId = cleanPlayerId(formData.get("playerId"));
    const files = formData
      .getAll("replays")
      .filter((file): file is File => file instanceof File && file.size > 0);

    if (!displayName && !playerId) {
      return Response.json(
        { error: "Escribe el nombre del jugador o su player id para asociar las partidas." },
        { status: 400 },
      );
    }

    if (files.length === 0) {
      return Response.json({ error: "Sube al menos un archivo .replay." }, { status: 400 });
    }

    await mkdir(inputDir, { recursive: true });

    const originalNames = new Map<string, string>();

    for (const [index, file] of files.entries()) {
      if (!file.name.toLowerCase().endsWith(".replay")) {
        return Response.json({ error: `El archivo ${file.name} no es un .replay.` }, { status: 400 });
      }

      if (file.size > MAX_REPLAY_BYTES) {
        return Response.json({ error: `${file.name} pesa mas de 120 MB.` }, { status: 400 });
      }

      const safeName = `${index + 1}-${path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      originalNames.set(safeName, file.name);
      await writeFile(path.join(inputDir, safeName), Buffer.from(await file.arrayBuffer()));
    }

    const parserScript = getParserScriptPath();
    await assertParserExists(parserScript);

    const args = ["--input", inputDir, "--output", outputDir, "--mode", "Normal"];
    if (playerId) {
      args.push("--player-id", playerId);
    }

    const { stdout, stderr } = await execFileAsync(parserScript, args, {
      timeout: 120_000,
      maxBuffer: 1024 * 1024 * 12,
    });

    const rawMatches = await readFile(path.join(outputDir, "matches-csharp.json"), "utf8");
    const matches = (JSON.parse(rawMatches) as ParserReplayMatch[]).map((match) => {
      const normalizedMatch = normalizeMatch(match);
      const originalName = originalNames.get(normalizedMatch.fileName);

      return {
        ...normalizedMatch,
        fileName: originalName ?? normalizedMatch.fileName,
        associatedPlayer: {
          displayName: normalizedMatch.playerName || displayName || playerId,
          playerId: normalizedMatch.localPlayerId || playerId || null,
          source: (normalizedMatch.localPlayerId || normalizedMatch.playerName ? "parser" : "manual") as "parser" | "manual",
        },
      } as ReplayMatch;
    });

    const responseBody = {
      player: {
        displayName: matches[0]?.associatedPlayer?.displayName ?? displayName,
        playerId: matches[0]?.associatedPlayer?.playerId ?? playerId,
      },
      summary: summarize(matches),
      matches,
      parser: {
        stdout,
        stderr,
      },
    };

    // Persistir en PostgreSQL (fire-and-forget, no bloquea la respuesta)
    persistReplays(matches as unknown as ReplayMatch[], responseBody).catch((err) =>
      console.error("[Replays] Error en persistencia:", err),
    );

    return Response.json(responseBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo procesar el replay.";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
