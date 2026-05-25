"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  CalendarDays,
  Database,
  Gauge,
  Layers,
  RefreshCcw,
  ShoppingBag,
  Table2,
  User,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type WarehouseData = {
  dimensions: {
    dates: number;
    apiActions: number;
    players: number;
    cosmetics: number;
  };
  facts: {
    apiCalls: number;
    shopAppearances: number;
    playerProgress: number;
  };
  marts: {
    reliabilityRows: number;
    predictionRows: number;
    streamWindows: number;
    deadLetters: number;
  };
  reliability: Array<{
    dateKey: string;
    apiSource: string;
    action: string;
    totalCalls: number;
    avgDurationMs: number;
    maxDurationMs: number;
    errors: number;
    errorRatePct: number;
  }>;
  streamMetrics: Array<{
    windowStart: string;
    apiSource: string;
    action: string;
    totalEvents: number;
    successCount: number;
    errorCount: number;
    errorRatePct: number;
    avgDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
    lastEventAt: string;
  }>;
  apiActions: Array<{
    action_key: number;
    action: string;
    api_source: string;
    business_domain: string;
  }>;
  players: Array<{
    player_key: string;
    display_name: string | null;
    platform: string | null;
    first_seen_at: string | null;
    last_seen_at: string | null;
    snapshot_count: string | number;
  }>;
  cosmetics: Array<{
    cosmetic_key: string;
    name: string;
    type: string | null;
    rarity: string | null;
    series: string | null;
    introduced_chapter: number | null;
    introduced_season: number | null;
    updated_at: string | null;
  }>;
  shopPredictions: Array<{
    cosmeticKey: string;
    name: string;
    type: string | null;
    rarity: string | null;
    appearancesCount: number;
    daysSinceLastSeen: number;
    predictedDaysUntilNext: number;
    predictedNextShopDate: string | null;
    confidenceScore: number;
    modelName: string | null;
  }>;
  playerProgress: Array<{
    progressKey: number;
    playerKey: string;
    dateKey: string | null;
    metricName: string;
    metricValue: number;
    delta: number;
    periodLabel: string | null;
    createdAt: string;
  }>;
};

const EMPTY_WAREHOUSE: WarehouseData = {
  dimensions: { dates: 0, apiActions: 0, players: 0, cosmetics: 0 },
  facts: { apiCalls: 0, shopAppearances: 0, playerProgress: 0 },
  marts: { reliabilityRows: 0, predictionRows: 0, streamWindows: 0, deadLetters: 0 },
  reliability: [],
  streamMetrics: [],
  apiActions: [],
  players: [],
  cosmetics: [],
  shopPredictions: [],
  playerProgress: [],
};

function formatNumber(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("es-MX");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-MX");
}

export default function WarehouseDashboard() {
  const [warehouse, setWarehouse] = useState<WarehouseData>(EMPTY_WAREHOUSE);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function loadWarehouse() {
    setLoading(true);
    try {
      const response = await fetch("/api/warehouse");
      const data = await response.json();
      setWarehouse(data.warehouse || EMPTY_WAREHOUSE);
      setDegraded(data.degraded ? data.error || "warehouse no disponible" : null);
      setLastUpdated(new Date());
    } catch (error) {
      setWarehouse(EMPTY_WAREHOUSE);
      setDegraded(error instanceof Error ? error.message : "warehouse no disponible");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/warehouse")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setWarehouse(data.warehouse || EMPTY_WAREHOUSE);
        setDegraded(data.degraded ? data.error || "warehouse no disponible" : null);
        setLastUpdated(new Date());
      })
      .catch((error) => {
        if (cancelled) return;
        setWarehouse(EMPTY_WAREHOUSE);
        setDegraded(error instanceof Error ? error.message : "warehouse no disponible");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const reliabilityChart = useMemo(
    () =>
      warehouse.reliability.slice(0, 8).reverse().map((row) => ({
        name: row.action.length > 14 ? `${row.action.slice(0, 14)}...` : row.action,
        calls: row.totalCalls,
        errors: row.errors,
      })),
    [warehouse.reliability]
  );

  return (
    <section className="min-h-screen bg-miyu-bg px-4 py-8 text-miyu-text sm:px-6 lg:px-10">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-miyu-text-muted">
            capa warehouse
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Data Mart Dimensional</h1>
          <p className="mt-2 max-w-2xl text-sm text-miyu-text-muted">
            Vistas analiticas sobre PostgreSQL: dimensiones, hechos y marts listos para consultas de negocio.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="rounded-md border border-miyu-border bg-white/80 px-3 py-2 text-xs font-mono text-miyu-text-muted">
              {lastUpdated.toLocaleTimeString("es-MX", { hour12: false })}
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadWarehouse()}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-miyu-border bg-miyu-btn px-4 text-sm font-semibold text-miyu-text transition-colors hover:bg-miyu-btn-hover"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </header>

      {degraded && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Modo degradado: {degraded}
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="dim fechas" value={warehouse.dimensions.dates} icon={CalendarDays} />
        <Metric label="dim acciones" value={warehouse.dimensions.apiActions} icon={Layers} />
        <Metric label="dim jugadores" value={warehouse.dimensions.players} icon={User} />
        <Metric label="dim cosmeticos" value={warehouse.dimensions.cosmetics} icon={ShoppingBag} />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Metric label="fact api calls" value={warehouse.facts.apiCalls} icon={Activity} />
        <Metric label="fact tienda" value={warehouse.facts.shopAppearances} icon={Boxes} />
        <Metric label="fact progreso" value={warehouse.facts.playerProgress} icon={Gauge} />
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <Panel title="Mart de Confiabilidad" icon={Database}>
          <div className="h-[260px]">
            {reliabilityChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reliabilityChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dfd8cc" vertical={false} />
                  <XAxis dataKey="name" fontSize={10} stroke="#615f5a" tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} stroke="#615f5a" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ border: "1px solid #dfd8cc", borderRadius: 8 }} />
                  <Bar dataKey="calls" fill="#8d72dc" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="errors" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="sin llamadas historicas" />
            )}
          </div>
        </Panel>

        <Panel title="Marts Publicados" icon={Table2}>
          <div className="grid gap-3">
            <MiniStat label="v_mart_api_reliability_daily" value={warehouse.marts.reliabilityRows} />
            <MiniStat label="v_mart_shop_predictions" value={warehouse.marts.predictionRows} />
            <MiniStat label="stream_api_metrics_minute" value={warehouse.marts.streamWindows} />
            <MiniStat label="stream_dead_letters" value={warehouse.marts.deadLetters} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="v_stream_api_metrics_latest" icon={Activity}>
          <Table
            headers={["ventana", "accion", "eventos", "ok", "error %", "avg ms"]}
            empty="sin ventanas streaming"
            rows={warehouse.streamMetrics.map((row) => [
              new Date(row.windowStart).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }),
              row.action,
              formatNumber(row.totalEvents),
              formatNumber(row.successCount),
              `${row.errorRatePct.toFixed(1)}%`,
              row.avgDurationMs.toFixed(0),
            ])}
          />
        </Panel>

        <Panel title="v_mart_api_reliability_daily" icon={Activity}>
          <Table
            headers={["fecha", "fuente", "accion", "calls", "error %", "avg ms"]}
            empty="sin metricas de confiabilidad"
            rows={warehouse.reliability.map((row) => [
              formatDate(row.dateKey),
              row.apiSource,
              row.action,
              formatNumber(row.totalCalls),
              `${row.errorRatePct.toFixed(1)}%`,
              row.avgDurationMs.toFixed(0),
            ])}
          />
        </Panel>

        <Panel title="v_mart_shop_predictions" icon={ShoppingBag}>
          <Table
            headers={["cosmetico", "apariciones", "dias", "fecha", "confianza"]}
            empty="sin predicciones batch"
            rows={warehouse.shopPredictions.map((row) => [
              row.name,
              formatNumber(row.appearancesCount),
              Math.round(row.predictedDaysUntilNext).toString(),
              formatDate(row.predictedNextShopDate),
              `${Math.round(row.confidenceScore * 100)}%`,
            ])}
          />
        </Panel>

        <Panel title="v_dim_api_action" icon={Layers}>
          <Table
            headers={["key", "dominio", "accion", "fuente"]}
            empty="sin acciones registradas"
            rows={warehouse.apiActions.map((row) => [
              formatNumber(row.action_key),
              row.business_domain,
              row.action,
              row.api_source,
            ])}
          />
        </Panel>

        <Panel title="v_dim_player" icon={User}>
          <Table
            headers={["jugador", "plataforma", "snapshots", "ultimo"]}
            empty="sin snapshots de jugadores"
            rows={warehouse.players.map((row) => [
              row.display_name || row.player_key,
              row.platform || "-",
              formatNumber(row.snapshot_count),
              formatDate(row.last_seen_at),
            ])}
          />
        </Panel>

        <Panel title="v_dim_cosmetic" icon={ShoppingBag}>
          <Table
            headers={["cosmetico", "tipo", "rareza", "temporada"]}
            empty="sin cosmeticos normalizados"
            rows={warehouse.cosmetics.map((row) => [
              row.name,
              row.type || "-",
              row.rarity || "-",
              [row.introduced_chapter, row.introduced_season].filter(Boolean).join(".") || "-",
            ])}
          />
        </Panel>

        <Panel title="v_fact_player_progress" icon={Gauge}>
          <Table
            headers={["player", "metrica", "valor", "delta", "fecha"]}
            empty="sin progreso transformado"
            rows={warehouse.playerProgress.map((row) => [
              row.playerKey,
              row.metricName,
              row.metricValue.toFixed(2),
              row.delta.toFixed(2),
              formatDate(row.createdAt),
            ])}
          />
        </Panel>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-md border border-miyu-border bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-miyu-text-muted">{label}</span>
        <Icon className="h-4 w-4 text-miyu-accent" />
      </div>
      <p className="text-3xl font-bold tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-miyu-border bg-white/80 p-5 shadow-sm">
      <h2 className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-miyu-text">
        <Icon className="h-4 w-4 text-miyu-accent" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-miyu-border bg-miyu-bg px-4 py-3">
      <p className="text-[10px] font-mono text-miyu-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

function Table({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-miyu-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="bg-miyu-bg text-[10px] uppercase tracking-[0.14em] text-miyu-text-muted">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-3 py-3 font-bold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${row.join("-")}-${rowIndex}`} className="border-t border-miyu-border">
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`} className="max-w-[220px] truncate px-3 py-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-[10px] uppercase tracking-[0.16em] text-miyu-text-muted">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-miyu-border bg-miyu-bg text-[10px] uppercase tracking-[0.16em] text-miyu-text-muted">
      {text}
    </div>
  );
}
