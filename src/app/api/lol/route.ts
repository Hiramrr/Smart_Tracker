import { NextRequest, NextResponse } from "next/server";
import { ensureDatabaseInitialized } from "@/lib/init";
import {
  getDdragonChampions,
  getLolChampionMastery,
  getLolMatch,
  getLolMatchIds,
  getLolOverview,
  getLolRankedEntries,
  getLolRankedEntriesByPuuid,
  getLolSummonerByPuuid,
  getRiotAccountByRiotId,
  logRiotApiCall,
} from "@/lib/riot";

export const dynamic = "force-dynamic";

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

function toInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || "overview";
  const platformRoute = searchParams.get("platform") || "la1";
  const regionalRoute = searchParams.get("region") || "americas";
  const logAction = action === "champions" ? "lol-static-champions" : `lol-${action}`;
  const commonLog = {
    sourceIp: getIp(req),
    userAgent: req.headers.get("user-agent") || "",
  };

  try {
    if (!process.env.RIOT_API_KEY && !process.env.RGAPI_KEY) {
      return NextResponse.json(
        { success: false, error: "RIOT_API_KEY no configurada" },
        { status: 503 }
      );
    }

    if (process.env.DATABASE_URL) {
      await ensureDatabaseInitialized().catch((error) => {
        console.warn("[Riot] Base de datos no disponible; continuando sin persistencia:", error);
      });
    }

    let payload: unknown;
    const parameters = Object.fromEntries(searchParams.entries());

    switch (action) {
      case "account": {
        const gameName = searchParams.get("gameName");
        const tagLine = searchParams.get("tagLine");
        if (!gameName || !tagLine) {
          return NextResponse.json(
            { success: false, error: "gameName y tagLine son requeridos" },
            { status: 400 }
          );
        }
        payload = await getRiotAccountByRiotId(gameName, tagLine, regionalRoute);
        break;
      }
      case "profile": {
        const puuid = searchParams.get("puuid");
        if (!puuid) {
          return NextResponse.json({ success: false, error: "puuid es requerido" }, { status: 400 });
        }
        payload = await getLolSummonerByPuuid(puuid, platformRoute);
        break;
      }
      case "ranked": {
        const summonerId = searchParams.get("summonerId");
        const puuid = searchParams.get("puuid");
        if (!summonerId && !puuid) {
          return NextResponse.json({ success: false, error: "puuid o summonerId es requerido" }, { status: 400 });
        }
        payload = puuid
          ? await getLolRankedEntriesByPuuid(puuid, platformRoute)
          : await getLolRankedEntries(String(summonerId), platformRoute);
        break;
      }
      case "mastery": {
        const puuid = searchParams.get("puuid");
        if (!puuid) {
          return NextResponse.json({ success: false, error: "puuid es requerido" }, { status: 400 });
        }
        payload = await getLolChampionMastery(puuid, platformRoute, toInt(searchParams.get("limit"), 8, 1, 25));
        break;
      }
      case "matches": {
        const puuid = searchParams.get("puuid");
        if (!puuid) {
          return NextResponse.json({ success: false, error: "puuid es requerido" }, { status: 400 });
        }
        payload = await getLolMatchIds(puuid, regionalRoute, toInt(searchParams.get("count"), 8, 1, 20));
        break;
      }
      case "match": {
        const matchId = searchParams.get("matchId");
        if (!matchId) {
          return NextResponse.json({ success: false, error: "matchId es requerido" }, { status: 400 });
        }
        payload = await getLolMatch(matchId, regionalRoute);
        break;
      }
      case "champions": {
        payload = await getDdragonChampions(searchParams.get("language") || "es_MX");
        break;
      }
      case "overview": {
        const gameName = searchParams.get("gameName");
        const tagLine = searchParams.get("tagLine");
        if (!gameName || !tagLine) {
          return NextResponse.json(
            { success: false, error: "gameName y tagLine son requeridos" },
            { status: 400 }
          );
        }
        payload = await getLolOverview({
          gameName,
          tagLine,
          platformRoute,
          regionalRoute,
          matchCount: toInt(searchParams.get("count"), 8, 1, 20),
        });
        break;
      }
      default:
        return NextResponse.json({ success: false, error: "accion no valida" }, { status: 400 });
    }

    await logRiotApiCall({
      ...commonLog,
      action: logAction,
      parameters,
      endpointUrl: `/api/lol?action=${action}`,
      status: 200,
      durationMs: Date.now() - startedAt,
      responseBody: payload,
    });

    return NextResponse.json({ success: true, action, data: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error consultando Riot API";
    await logRiotApiCall({
      ...commonLog,
      action: logAction,
      parameters: Object.fromEntries(searchParams.entries()),
      endpointUrl: `/api/lol?action=${action}`,
      status: message.includes("no configurada") ? 503 : 500,
      durationMs: Date.now() - startedAt,
      responseBody: { error: message },
    });

    return NextResponse.json(
      { success: false, error: message },
      { status: message.includes("no configurada") ? 503 : 500 }
    );
  }
}
