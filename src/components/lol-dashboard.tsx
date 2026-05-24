"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Activity,
  BadgeIcon,
  Brain,
  Crown,
  Database,
  Gauge,
  Gamepad2,
  Loader2,
  Search,
  Shield,
  Sparkles,
  Swords,
  Target,
  Timer,
  Trophy,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type JsonRecord = Record<string, unknown>;

type LolOverview = {
  account: JsonRecord;
  summoner: JsonRecord | null;
  ranked: JsonRecord[];
  mastery: JsonRecord[];
  matches: JsonRecord[];
  recentMatches?: JsonRecord[];
  matchIds: string[];
  champions: {
    version?: string;
    byKey?: Record<string, ChampionStatic>;
  };
  analysis: JsonRecord;
};

type LolClassification = {
  skillLabel: string;
  skillValue: number;
  playstyleLabel: string | null;
  mainRole: string | null;
  mainChampion: string | null;
  matchesAnalyzed: number;
  winRate: number;
  avgKda: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgCsPerMin: number;
  avgGoldPerMin: number;
  rankedScore: number;
  rankedTier: string | null;
  predictedRank: string | null;
  predictedRankScore: number;
  rankPredictionConfidence: string | null;
  rankPredictionReasoning: string | null;
  focusAreas: Array<{
    area: string;
    priority: string;
    metric: number;
    advice: string;
  }>;
  championRecommendations: Array<{
    champion: string;
    role: string;
    games: number;
    winRate: number | null;
    avgKda: number | null;
    reason: string;
  }>;
  nextPick: {
    champion?: string;
    role?: string;
    games?: number;
    winRate?: number | null;
    avgKda?: number | null;
    reason?: string;
  } | null;
  beginnerPick: {
    champion?: string;
    role?: string;
    games?: number;
    winRate?: number | null;
    avgKda?: number | null;
    reason?: string;
  } | null;
  clusterId: number | null;
  modelName: string;
  createdAt: string;
};

type ChampionStatic = {
  id?: string;
  key?: string;
  name?: string;
  title?: string;
  image?: string;
};

const PLATFORMS = [
  { value: "la1", label: "LAN" },
  { value: "la2", label: "LAS" },
  { value: "na1", label: "NA" },
  { value: "br1", label: "BR" },
  { value: "euw1", label: "EUW" },
  { value: "kr", label: "KR" },
];

function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString("es-MX");
}

function formatDecimal(value: unknown, digits = 1) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "0";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clampPercent(value: number, max: number) {
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function classificationSummary(classification: LolClassification) {
  const role = classification.mainRole || "rol variable";
  const champion = classification.mainChampion || "pool flexible";
  const style = classification.playstyleLabel || "Balanceado";
  const kda = formatDecimal(classification.avgKda, 2);
  const winRate = formatDecimal(classification.winRate, 1);

  if (classification.skillLabel === "Competitivo") {
    return `Perfil competitivo: ${style.toLowerCase()} desde ${role}, con ${kda} KDA promedio y ${winRate}% de win rate. Su muestra apunta a impacto alto alrededor de ${champion}.`;
  }
  if (classification.skillLabel === "Intermedio") {
    return `Perfil intermedio: rendimiento estable desde ${role}, ${kda} KDA promedio y ${winRate}% de win rate. El modelo detecta una base solida con margen para subir consistencia alrededor de ${champion}.`;
  }
  return `Perfil casual: muestra aun temprana o irregular desde ${role}, con ${kda} KDA promedio y ${winRate}% de win rate. El modelo necesita mas partidas para separar tendencia real de ruido.`;
}

function championFor(id: unknown, champions?: Record<string, ChampionStatic>) {
  return champions?.[String(id || "")] || {};
}

export function LolDashboard() {
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [platform, setPlatform] = useState("la1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<LolOverview | null>(null);
  const [classification, setClassification] = useState<LolClassification | null>(null);

  const champions = overview?.champions?.byKey || {};
  const rankedSolo = overview?.ranked?.find((queue) => queue.queueType === "RANKED_SOLO_5x5");
  const rankedFlex = overview?.ranked?.find((queue) => queue.queueType === "RANKED_FLEX_SR");
  const profileIcon = overview?.summoner?.profileIconId && overview?.champions?.version
    ? `https://ddragon.leagueoflegends.com/cdn/${overview.champions.version}/img/profileicon/${overview.summoner.profileIconId}.png`
    : null;

  const recentMatches = useMemo(
    () => overview?.recentMatches || [],
    [overview]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        action: "overview",
        gameName: gameName.trim(),
        tagLine: tagLine.trim(),
        platform,
        region: platform === "euw1" || platform === "kr" ? (platform === "kr" ? "asia" : "europe") : "americas",
        count: "8",
      });
      const response = await fetch(`/api/lol?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo consultar Riot");
      setOverview(payload.data);
      setClassification(null);

      if (payload.data?.account?.puuid) {
        const classificationResponse = await fetch(
          `/api/lol/classification?puuid=${encodeURIComponent(String(payload.data.account.puuid))}`
        );
        const classificationPayload = await classificationResponse.json();
        if (classificationPayload.success) {
          setClassification(classificationPayload.classification || null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar Riot");
      setOverview(null);
      setClassification(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="min-h-screen bg-miyu-bg px-4 py-8 text-miyu-text sm:px-6 lg:px-10">
      <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-miyu-text-muted">
            league of legends
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Riot Data Hub</h1>
          <p className="mt-2 max-w-2xl text-sm text-miyu-text-muted">
            Riot ID, ranked, maestrias, partidas recientes y snapshots persistidos en PostgreSQL.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-2 rounded-md border border-miyu-border bg-white/85 p-3 shadow-sm sm:grid-cols-[minmax(150px,1fr)_110px_120px_auto]">
          <Input
            value={gameName}
            onChange={(event) => setGameName(event.target.value)}
            placeholder="Game Name"
            className="h-10 rounded-md bg-white"
            required
          />
          <Input
            value={tagLine}
            onChange={(event) => setTagLine(event.target.value)}
            placeholder="TAG"
            className="h-10 rounded-md bg-white"
            required
          />
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            className="h-10 rounded-md border border-miyu-border bg-white px-3 text-sm font-medium outline-none"
          >
            {PLATFORMS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <Button type="submit" className="h-10 rounded-md bg-miyu-btn px-4 text-miyu-text hover:bg-miyu-btn-hover" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </Button>
        </form>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!overview ? (
        <div className="grid min-h-[420px] place-items-center rounded-md border border-dashed border-miyu-border bg-white/60">
          <div className="max-w-md px-6 text-center">
            <Gamepad2 className="mx-auto h-10 w-10 text-miyu-text-muted" />
            <h2 className="mt-4 text-xl font-bold">Busca un Riot ID</h2>
            <p className="mt-2 text-sm text-miyu-text-muted">
              La consulta se guarda como cache, api_call y snapshot LoL para el warehouse.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-md border border-miyu-border bg-white p-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-miyu-border bg-miyu-secondary">
                  {profileIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileIcon} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-10 w-10" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-3xl font-bold">
                      {String(overview.account.gameName || gameName)}
                      <span className="text-miyu-text-muted">#{String(overview.account.tagLine || tagLine)}</span>
                    </h2>
                    <Badge variant="outline" className="rounded-md uppercase">
                      {platform}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-miyu-text-muted">
                    Nivel {formatNumber(overview.summoner?.summonerLevel)} · PUUID {String(overview.account.puuid || "").slice(0, 12)}...
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <Metric icon={Trophy} label="Win rate" value={`${formatNumber(overview.analysis.winRate)}%`} />
                    <Metric icon={Swords} label="KDA" value={formatNumber(overview.analysis.kda)} />
                    <Metric icon={Activity} label="Kills avg" value={formatNumber(overview.analysis.avgKills)} />
                    <Metric icon={Shield} label="CS avg" value={formatNumber(overview.analysis.avgCs)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <RankBlock title="Solo/Duo" ranked={rankedSolo} />
              <RankBlock title="Flex" ranked={rankedFlex} />
            </div>
          </section>

          <LolClassificationSection classification={classification} />

          <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-md border border-miyu-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">Maestrias</h3>
                <Sparkles className="h-5 w-5 text-miyu-text-muted" />
              </div>
              <div className="space-y-3">
                {overview.mastery.slice(0, 8).map((mastery) => {
                  const champion = championFor(mastery.championId, champions);
                  return (
                    <div key={String(mastery.championId)} className="flex items-center gap-3 rounded-md border border-miyu-border bg-miyu-secondary/40 p-2">
                      <div className="h-11 w-11 overflow-hidden rounded-md bg-white">
                        {champion.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={champion.image} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{champion.name || `Champion ${String(mastery.championId)}`}</p>
                        <p className="text-xs text-miyu-text-muted">Nivel {formatNumber(mastery.championLevel)}</p>
                      </div>
                      <Badge variant="outline" className="rounded-md">
                        {formatNumber(mastery.championPoints)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-miyu-border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">Partidas recientes</h3>
                <BadgeIcon className="h-5 w-5 text-miyu-text-muted" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-miyu-border text-xs uppercase text-miyu-text-muted">
                    <tr>
                      <th className="py-2 pr-3">Campeon</th>
                      <th className="py-2 pr-3">Resultado</th>
                      <th className="py-2 pr-3">KDA</th>
                      <th className="py-2 pr-3">CS</th>
                      <th className="py-2 pr-3">Oro</th>
                      <th className="py-2 pr-3">Queue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-miyu-border">
                    {recentMatches.map((match) => {
                      const champion = championFor(match.championId, champions);
                      const championImage = String(match.championImage || champion.image || "");
                      return (
                        <tr key={String(match.matchId)} className="align-middle">
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              <div className="h-9 w-9 overflow-hidden rounded-md bg-miyu-secondary">
                                {championImage ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={championImage} alt="" className="h-full w-full object-cover" />
                                ) : null}
                              </div>
                              <span className="font-semibold">{String(match.championName || champion.name || "-")}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <Badge variant={match.win ? "default" : "outline"} className="rounded-md">
                              {match.win ? "Victoria" : "Derrota"}
                            </Badge>
                          </td>
                          <td className="py-3 pr-3 font-mono">
                            {formatNumber(match.kills)} / {formatNumber(match.deaths)} / {formatNumber(match.assists)}
                          </td>
                          <td className="py-3 pr-3">{formatNumber(match.cs)}</td>
                          <td className="py-3 pr-3">{formatNumber(match.gold)}</td>
                          <td className="py-3 pr-3">{formatNumber(match.queueId)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <p className="text-xs text-miyu-text-muted">
            Miyu Tracker is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string }) {
  return (
    <div className="rounded-md border border-miyu-border bg-white/70 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-miyu-text-muted">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function LolClassificationSection({ classification }: { classification: LolClassification | null }) {
  return (
    <section className="rounded-md border border-miyu-border bg-white">
      <div className="border-b border-miyu-border p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-miyu-text-muted">
              modelo batch / ml
            </p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight">Clasificacion competitiva LoL</h3>
            <p className="mt-2 max-w-3xl text-sm text-miyu-text-muted">
              Agrega partidas guardadas, ranked, rol, campeones y ritmo de economia para separar perfil, estilo y nivel competitivo.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-miyu-border bg-miyu-secondary/40 px-3 py-2 text-xs font-mono text-miyu-text-muted">
            <Database className="h-4 w-4" />
            v_mart_lol_player_classification
          </div>
        </div>
      </div>

      {classification ? (
        <div className="space-y-6 p-5">
          <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
            <div className="rounded-md border border-miyu-border bg-miyu-secondary/25 p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-miyu-text-muted">
                    diagnostico
                  </p>
                  <h4 className="mt-2 text-3xl font-bold">{classification.skillLabel}</h4>
                </div>
                <Brain className="h-6 w-6 text-miyu-text-muted" />
              </div>
              <p className="max-w-3xl text-sm leading-6 text-miyu-text-muted">
                {classificationSummary(classification)}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <InsightPill label="Estilo" value={classification.playstyleLabel || "-"} />
                <InsightPill label="Rol dominante" value={classification.mainRole || "-"} />
                <InsightPill label="Campeon frecuente" value={classification.mainChampion || "-"} />
              </div>
            </div>

            <div className="rounded-md border border-miyu-border p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-miyu-text-muted">
                  contexto del modelo
                </h4>
                <Gauge className="h-5 w-5 text-miyu-text-muted" />
              </div>
              <div className="space-y-3 text-sm">
                <ModelRow label="Modelo" value={classification.modelName} />
                <ModelRow label="Muestra" value={`${classification.matchesAnalyzed} partidas`} />
                <ModelRow label="Ranked base" value={classification.rankedTier || "Sin ranked"} />
                <ModelRow label="Cluster" value={classification.clusterId === null ? "fallback score" : `cluster ${classification.clusterId}`} />
                <ModelRow label="Actualizado" value={formatDateTime(classification.createdAt)} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <Metric icon={Trophy} label="Win rate ML" value={`${formatDecimal(classification.winRate, 1)}%`} />
            <Metric icon={Swords} label="KDA promedio" value={formatDecimal(classification.avgKda, 2)} />
            <Metric icon={Target} label="CS/min" value={formatDecimal(classification.avgCsPerMin, 2)} />
            <Metric icon={Timer} label="Oro/min" value={formatDecimal(classification.avgGoldPerMin, 0)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-md border border-miyu-border p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-miyu-text-muted">
                  prediccion de rango
                </h4>
                <Crown className="h-5 w-5 text-miyu-text-muted" />
              </div>
              <div className="rounded-md border border-miyu-border bg-miyu-secondary/25 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-miyu-text-muted">
                  siguiente rango posible
                </p>
                <p className="mt-2 text-3xl font-bold">{classification.predictedRank || "Sin proyeccion"}</p>
                <p className="mt-2 text-sm text-miyu-text-muted">
                  Confianza {classification.rankPredictionConfidence || "baja"} · score {formatDecimal(classification.predictedRankScore, 2)}
                </p>
              </div>
              <p className="mt-4 text-sm leading-6 text-miyu-text-muted">
                {classification.rankPredictionReasoning || "El modelo necesita mas partidas ranked recientes para explicar esta proyeccion."}
              </p>
            </div>

            <div className="rounded-md border border-miyu-border p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-miyu-text-muted">
                  en que centrarse
                </h4>
                <Target className="h-5 w-5 text-miyu-text-muted" />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {(classification.focusAreas || []).slice(0, 3).map((focus) => (
                  <div key={focus.area} className="rounded-md border border-miyu-border bg-miyu-secondary/25 p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-bold">{focus.area}</p>
                      <Badge variant="outline" className="rounded-md">
                        {focus.priority}
                      </Badge>
                    </div>
                    <p className="text-xs font-mono text-miyu-text-muted">valor {formatDecimal(focus.metric, 2)}</p>
                    <p className="mt-3 text-sm leading-5 text-miyu-text-muted">{focus.advice}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <PickCard
              title="siguiente partida"
              pick={classification.nextPick}
              fallback="Usa tu campeon principal y mantén el mismo rol para reducir ruido en la muestra."
            />
            <div className="rounded-md border border-miyu-border p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-miyu-text-muted">
                  recomendaciones de pool
                </h4>
                <Sparkles className="h-5 w-5 text-miyu-text-muted" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <PickCard
                  title="para practicar facil"
                  pick={classification.beginnerPick}
                  fallback="Elige un campeon simple de tu rol para enfocarte en oleadas, posicionamiento y objetivos."
                />
                {(classification.championRecommendations || []).slice(0, 3).map((pick) => (
                  <PickMini key={`${pick.champion}-${pick.role}`} pick={pick} />
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-md border border-miyu-border p-5">
              <h4 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-miyu-text-muted">
                senales de rendimiento
              </h4>
              <div className="space-y-4">
                <SignalBar label="Win rate" value={classification.winRate} max={100} display={`${formatDecimal(classification.winRate, 1)}%`} />
                <SignalBar label="KDA" value={classification.avgKda} max={6} display={formatDecimal(classification.avgKda, 2)} />
                <SignalBar label="CS/min" value={classification.avgCsPerMin} max={10} display={formatDecimal(classification.avgCsPerMin, 2)} />
                <SignalBar label="Oro/min" value={classification.avgGoldPerMin} max={650} display={formatDecimal(classification.avgGoldPerMin, 0)} />
                <SignalBar label="Ranked score" value={classification.rankedScore} max={10} display={formatDecimal(classification.rankedScore, 2)} />
              </div>
            </div>

            <div className="rounded-md border border-miyu-border p-5">
              <h4 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-miyu-text-muted">
                combate promedio
              </h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <CombatStat label="Kills" value={classification.avgKills} />
                <CombatStat label="Deaths" value={classification.avgDeaths} />
                <CombatStat label="Assists" value={classification.avgAssists} />
              </div>
              <div className="mt-5 rounded-md border border-miyu-border bg-miyu-secondary/25 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-miyu-text-muted">
                  lectura rapida
                </p>
                <p className="mt-2 text-sm leading-6 text-miyu-text-muted">
                  {classification.playstyleLabel === "Carry agresivo"
                    ? "Prioriza ventaja por peleas y snowball; conviene vigilar muertes tempranas y conversion de objetivos."
                    : classification.playstyleLabel === "Farmeo / macro"
                      ? "Su impacto viene de economia y oleadas; conviene mirar CS/min, tempo de rotaciones y peleas tomadas con ventaja."
                      : classification.playstyleLabel === "Utilidad de equipo"
                        ? "Aporta mas por asistencias y presencia grupal; conviene revisar vision, peel y participacion en objetivos."
                        : classification.playstyleLabel === "Riesgo alto"
                          ? "Genera accion pero concede demasiadas ventanas; bajar muertes promedio moveria rapido la clasificacion."
                          : "Perfil equilibrado: no sobresale por una sola metrica, asi que el siguiente salto depende de consistencia entre KDA, economia y win rate."}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <div className="rounded-md border border-dashed border-miyu-border bg-miyu-secondary/30 p-5">
            <div className="flex items-start gap-3">
              <Brain className="mt-1 h-5 w-5 text-miyu-text-muted" />
              <div>
                <h4 className="text-base font-bold">Sin clasificacion batch</h4>
                <p className="mt-2 max-w-2xl text-sm text-miyu-text-muted">
                  Este jugador ya puede tener datos Riot en crudo, pero todavia no existe un resultado materializado en el mart de clasificacion.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function InsightPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-miyu-border bg-white px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-miyu-text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-bold">{value}</p>
    </div>
  );
}

function ModelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-miyu-border pb-2 last:border-b-0 last:pb-0">
      <span className="text-miyu-text-muted">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function SignalBar({ label, value, max, display }: { label: string; value: number; max: number; display: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-bold uppercase tracking-[0.12em] text-miyu-text-muted">{label}</span>
        <span className="font-mono font-semibold">{display}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-md bg-miyu-secondary">
        <div
          className="h-full rounded-md bg-miyu-text"
          style={{ width: `${clampPercent(value, max)}%` }}
        />
      </div>
    </div>
  );
}

function CombatStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-miyu-border bg-miyu-secondary/25 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-miyu-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold">{formatDecimal(value, 1)}</p>
    </div>
  );
}

function PickCard({
  title,
  pick,
  fallback,
}: {
  title: string;
  pick: LolClassification["nextPick"];
  fallback: string;
}) {
  return (
    <div className="rounded-md border border-miyu-border bg-miyu-secondary/25 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-miyu-text-muted">{title}</p>
      <h4 className="mt-2 text-2xl font-bold">{pick?.champion || "Pool estable"}</h4>
      <p className="mt-1 text-sm text-miyu-text-muted">{pick?.role || "rol principal"}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <SmallStat label="games" value={pick?.games ?? 0} />
        <SmallStat label="WR" value={pick?.winRate === null || pick?.winRate === undefined ? "-" : `${formatDecimal(pick.winRate, 1)}%`} />
        <SmallStat label="KDA" value={pick?.avgKda === null || pick?.avgKda === undefined ? "-" : formatDecimal(pick.avgKda, 2)} />
      </div>
      <p className="mt-4 text-sm leading-6 text-miyu-text-muted">{pick?.reason || fallback}</p>
    </div>
  );
}

function PickMini({ pick }: { pick: NonNullable<LolClassification["championRecommendations"]>[number] }) {
  return (
    <div className="rounded-md border border-miyu-border bg-white p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{pick.champion}</p>
          <p className="text-xs text-miyu-text-muted">{pick.role}</p>
        </div>
        <Badge variant="outline" className="rounded-md">
          {pick.games} games
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <SmallStat label="WR" value={pick.winRate === null ? "-" : `${formatDecimal(pick.winRate, 1)}%`} />
        <SmallStat label="KDA" value={pick.avgKda === null ? "-" : formatDecimal(pick.avgKda, 2)} />
      </div>
      <p className="mt-3 text-xs leading-5 text-miyu-text-muted">{pick.reason}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-miyu-border bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-miyu-text-muted">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function RankBlock({ title, ranked }: { title: string; ranked?: JsonRecord }) {
  return (
    <div className="rounded-md border border-miyu-border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-miyu-text-muted">{title}</p>
        <Crown className="h-5 w-5 text-miyu-text-muted" />
      </div>
      {ranked ? (
        <>
          <p className="text-2xl font-bold">
            {String(ranked.tier || "UNRANKED")} {String(ranked.rank || "")}
          </p>
          <p className="mt-1 text-sm text-miyu-text-muted">
            {formatNumber(ranked.leaguePoints)} LP · {formatNumber(ranked.wins)}W / {formatNumber(ranked.losses)}L
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-bold">Unranked</p>
          <p className="mt-1 text-sm text-miyu-text-muted">Sin datos para esta cola.</p>
        </>
      )}
    </div>
  );
}
