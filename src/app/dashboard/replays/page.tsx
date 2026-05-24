"use client";

import { FormEvent, useMemo, useState } from "react";
import { Activity, Crosshair, Gauge, Swords, Upload, UserRound, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ReplayResult = {
  player: {
    displayName: string;
    playerId: string | null;
  };
  summary: {
    totalMatches: number;
    wins: number;
    kills: number;
    deaths: number;
    kd: number;
    averageKills: number;
    averagePlacement: number | null;
    damageToPlayers: number;
    damageFromPlayers: number;
    averageDamage: number;
    averageAccuracy: number | null;
  };
  matches: Array<{
    replayId: string;
    fileName: string;
    duration?: string | null;
    playlist?: string | null;
    statsSource?: string | null;
    totalPlayers?: number | null;
    placement?: number | null;
    displayEliminations?: number | null;
    displayTeamEliminations?: number | null;
    displayDeaths?: number | null;
    damageToPlayers?: number | null;
    damageFromPlayers?: number | null;
    accuracyPercent?: number | null;
    eventEliminations?: number | null;
    killFeedEvents?: number | null;
    associatedPlayer: {
      displayName: string;
      playerId: string | null;
      source: "parser" | "manual";
    };
  }>;
};

function formatNumber(value: number | null | undefined, digits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-lg border border-miyu-border bg-miyu-surface p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-miyu-accent-light text-miyu-accent">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-semibold uppercase text-miyu-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-miyu-text">{value}</p>
    </div>
  );
}

export default function FortniteReplaysPage() {
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  const selectedLabel = useMemo(() => {
    if (!selectedFiles?.length) {
      return "Sin archivos seleccionados";
    }

    return `${selectedFiles.length} replay${selectedFiles.length === 1 ? "" : "s"} listo${selectedFiles.length === 1 ? "" : "s"}`;
  }, [selectedFiles]);

  async function parseReplays(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsParsing(true);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/replays/fortnite", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo procesar el replay.");
      }

      setResult(payload as ReplayResult);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "No se pudo procesar el replay.");
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="min-h-screen bg-miyu-bg px-6 py-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-miyu-accent">
            Fortnite replays
          </p>
          <h1 className="text-3xl font-bold text-miyu-text">Sube partidas y calcula estadisticas</h1>
          <p className="max-w-3xl text-sm text-miyu-text-muted">
            Procesa archivos .replay con el parser C# local y asigna las estadisticas al jugador indicado cuando el replay no trae identidad confiable.
          </p>
        </header>

        <form
          onSubmit={parseReplays}
          className="grid gap-4 rounded-lg border border-miyu-border bg-miyu-surface p-5 lg:grid-cols-[1fr_1fr_auto]"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-miyu-text">Jugador</span>
            <Input name="displayName" placeholder="Ej. hiramrr." autoComplete="off" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-miyu-text">Player ID opcional</span>
            <Input name="playerId" placeholder="EFB4EAF1..." autoComplete="off" />
          </label>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-miyu-border bg-miyu-bg px-3 text-sm font-semibold text-miyu-text transition-colors hover:bg-miyu-secondary">
              <Upload className="h-4 w-4" />
              Replays
              <input
                className="sr-only"
                name="replays"
                type="file"
                accept=".replay"
                multiple
                onChange={(event) => setSelectedFiles(event.target.files)}
              />
            </label>
            <span className="max-w-[180px] truncate text-xs text-miyu-text-muted">{selectedLabel}</span>
          </div>
          <div className="lg:col-span-3">
            <Button type="submit" disabled={isParsing} className="w-full sm:w-auto">
              <Activity className="h-4 w-4" />
              {isParsing ? "Procesando..." : "Analizar replays"}
            </Button>
          </div>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 lg:col-span-3">
              {error}
            </p>
          ) : null}
        </form>

        {result ? (
          <section className="flex flex-col gap-5">
            <div className="rounded-lg border border-miyu-border bg-miyu-surface p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-miyu-text-muted">Estadisticas asociadas a</p>
                  <h2 className="text-2xl font-bold text-miyu-text">{result.player.displayName}</h2>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-miyu-bg px-3 py-2 text-sm text-miyu-text-muted">
                  <UserRound className="h-4 w-4 text-miyu-accent" />
                  <span className="max-w-[320px] truncate">{result.player.playerId ?? "Asociacion manual"}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Partidas" value={formatNumber(result.summary.totalMatches)} icon={Users} />
              <StatTile label="Kills" value={formatNumber(result.summary.kills)} icon={Crosshair} />
              <StatTile label="K/D" value={formatNumber(result.summary.kd, 2)} icon={Swords} />
              <StatTile label="Damage promedio" value={formatNumber(result.summary.averageDamage)} icon={Gauge} />
            </div>

            <div className="overflow-hidden rounded-lg border border-miyu-border bg-miyu-surface">
              <div className="border-b border-miyu-border px-5 py-4">
                <h3 className="text-lg font-bold text-miyu-text">Partidas procesadas</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-miyu-bg text-xs uppercase text-miyu-text-muted">
                    <tr>
                      <th className="px-4 py-3">Replay</th>
                      <th className="px-4 py-3">Playlist</th>
                      <th className="px-4 py-3">Placement</th>
                      <th className="px-4 py-3">Kills</th>
                      <th className="px-4 py-3">Deaths</th>
                      <th className="px-4 py-3">Damage</th>
                      <th className="px-4 py-3">Accuracy</th>
                      <th className="px-4 py-3">Fuente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-miyu-border">
                    {result.matches.map((match) => (
                      <tr key={match.replayId} className="text-miyu-text">
                        <td className="max-w-[260px] truncate px-4 py-3 font-medium">{match.fileName}</td>
                        <td className="px-4 py-3 text-miyu-text-muted">{match.playlist ?? "N/A"}</td>
                        <td className="px-4 py-3">{formatNumber(match.placement)}</td>
                        <td className="px-4 py-3">{formatNumber(match.displayEliminations)}</td>
                        <td className="px-4 py-3">{formatNumber(match.displayDeaths)}</td>
                        <td className="px-4 py-3">{formatNumber(match.damageToPlayers)}</td>
                        <td className="px-4 py-3">{formatNumber(match.accuracyPercent, 1)}%</td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-miyu-accent-light px-2 py-1 text-xs font-semibold text-miyu-accent">
                            {match.associatedPlayer.source === "parser" ? match.statsSource : "manual"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
