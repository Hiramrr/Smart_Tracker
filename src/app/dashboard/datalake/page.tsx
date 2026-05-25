"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Globe,
  Layers,
  RefreshCcw,
  User,
  ShoppingBag,
  ArrowRight,
  Terminal,
  ChevronRight,
  BarChart,
  HardDrive,
  Info,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
  PieChart,
  Pie,
} from "recharts";

// ==========================================
// Types
// ==========================================
interface RecentCall {
  id: string;
  action: string;
  api_source: string;
  response_status: number;
  duration_ms: number;
  created_at: string;
  parameters: Record<string, unknown>;
}

interface Stats {
  totalCalls: number;
  todayCalls: number;
  callsByAction: Array<{ action: string; total: string; avg_duration: string }>;
  callsBySource: Array<{ api_source: string; total: string }>;
  errors: Array<{ response_status: string; total: string }>;
  recentCalls: RecentCall[];
  hourlyStats: Array<{ hour: string; total: number; avgDuration: string }>;
  snapshots: {
    total: number;
    recent: Array<{ id: string; display_name: string; platform: string; captured_at: string }>;
  };
  shop: {
    totalEntries: number;
    cosmetics: number;
    cosmeticAppearances: number;
    dailySnapshots: number;
    predictions: number;
    latestPredictions: Array<{
      cosmeticKey: string;
      name: string;
      type: string | null;
      rarity: string | null;
      appearancesCount: number;
      daysSinceLastSeen: number;
      predictedDaysUntilNext: number;
      predictedNextShopDate: string;
      confidenceScore: number;
      modelName: string;
      predictionCreatedAt: string;
    }>;
  };
  cache: {
    entries: number;
    staleEntries: number;
    snapshots: number;
  };
  warehouse: {
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
    }>;
    deadLetters: number;
  };
  progress: {
    recent: unknown[];
  };
}

const COLORS = ["#8d72dc", "#b4a1ea", "#615f5a", "#dfd8cc", "#111111"];

// ==========================================
// Dashboard Component
// ==========================================
export default function DatalakeDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedCall, setSelectedCall] = useState<RecentCall | null>(null);

  const selectedCallRef = useRef<RecentCall | null>(null);
  const statsRef = useRef<Stats | null>(null);

  useEffect(() => { selectedCallRef.current = selectedCall; }, [selectedCall]);
  useEffect(() => { statsRef.current = stats; }, [stats]);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const response = await fetch("/api/datalake/stats");
        const data = await response.json();
        if (data.success) {
          setStats(data.stats as Stats);
          setLastUpdated(new Date());
          if (data.stats.recentCalls.length > 0 && !selectedCallRef.current) {
            setSelectedCall(data.stats.recentCalls[0] as RecentCall);
          }
        } else {
          throw new Error("API returned success: false");
        }
      } catch (error) {
        console.error("Error fetching datalake stats:", error);
        // Fallback para evitar que se quede cargando infinito o en blanco si falla la tabla nueva
        if (!statsRef.current) {
          setStats({
            totalCalls: 0,
            todayCalls: 0,
            callsByAction: [],
            callsBySource: [],
            errors: [],
            recentCalls: [],
            hourlyStats: [],
            snapshots: { total: 0, recent: [] },
            shop: {
              totalEntries: 0,
              cosmetics: 0,
              cosmeticAppearances: 0,
              dailySnapshots: 0,
              predictions: 0,
              latestPredictions: [],
            },
            cache: { entries: 0, staleEntries: 0, snapshots: 0 },
            warehouse: {
              dimensions: { dates: 0, apiActions: 0, players: 0, cosmetics: 0 },
              facts: { apiCalls: 0, shopAppearances: 0, playerProgress: 0 },
              reliability: [],
              streamMetrics: [],
              deadLetters: 0,
            },
            progress: { recent: [] }
          });
        }
      } finally {
        setLoading(false);
      }
    }
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-miyu-bg text-miyu-text font-mono">
        <div className="flex flex-col items-center gap-4">
          <RefreshCcw className="w-8 h-8 animate-spin text-miyu-accent" />
          <p className="text-xs uppercase tracking-widest text-miyu-text-muted">cargando_data_lake</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-miyu-bg text-miyu-text p-6 lg:p-10 font-sans selection:bg-miyu-accent/20">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <Link href="/" className="text-xs font-mono font-bold text-miyu-accent hover:underline flex items-center gap-1">
                {">"}_ smart.
             </Link>
             <ChevronRight className="w-3 h-3 text-miyu-border" />
             <span className="text-xs font-mono text-miyu-text-muted uppercase tracking-widest">datalake_monitoring</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-miyu-text">
            Panel de Ingeniería de Datos
          </h1>
          <p className="text-sm text-miyu-text-muted mt-1 max-w-xl">
            Monitoreo y análisis de la arquitectura Kappa. Eventos procesados desde APIs de Fortnite y transformaciones ETL.
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-miyu-surface border border-miyu-border rounded-xl p-4 shadow-sm">
          <div className="text-right">
            <p className="text-[10px] text-miyu-text-muted uppercase tracking-widest font-mono">Sincronizado</p>
            <p className="text-sm font-bold text-miyu-text">{lastUpdated.toLocaleTimeString([], { hour12: false })}</p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              void (async () => {
                try {
                  const response = await fetch("/api/datalake/stats");
                  const data = await response.json();
                  if (data.success) {
                    setStats(data.stats as Stats);
                    setLastUpdated(new Date());
                    if (data.stats.recentCalls.length > 0 && !selectedCallRef.current) {
                      setSelectedCall(data.stats.recentCalls[0] as RecentCall);
                    }
                  }
                } catch (error) {
                  console.error(error);
                } finally {
                  setLoading(false);
                }
              })();
            }}
            className="flex items-center justify-center w-10 h-10 bg-miyu-btn hover:bg-miyu-btn-hover text-miyu-text border border-miyu-text/10 rounded-lg transition-all active:scale-95"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Main Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <MetricTile
          label="EVENTOS_TOTALES"
          value={stats?.totalCalls}
          icon={<Activity className="w-4 h-4 text-miyu-accent" />}
          description="Llamadas capturadas"
        />
        <MetricTile
          label="FLUJO_HOY"
          value={stats?.todayCalls}
          icon={<Globe className="w-4 h-4 text-miyu-accent" />}
          description="En las últimas 24h"
        />
        <MetricTile
          label="SNAPSHOTS_PERSISTIDOS"
          value={stats?.snapshots.total}
          icon={<User className="w-4 h-4 text-miyu-accent" />}
          description="Perfiles procesados"
        />
        <MetricTile
          label="HISTORIAL_TIENDA"
          value={stats?.shop.totalEntries}
          icon={<ShoppingBag className="w-4 h-4 text-miyu-accent" />}
          description="Registros únicos"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 mb-10 lg:grid-cols-3">
        <div className="bg-miyu-surface border border-miyu-border rounded-2xl p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-sm font-bold flex items-center gap-2 text-miyu-text uppercase tracking-widest">
              <HardDrive className="w-4 h-4 text-miyu-accent" /> Mini Data Mart
            </h2>
            <span className="rounded-full bg-miyu-accent-light px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-miyu-accent">
              Warehouse Views
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <WarehouseCount label="Dim fechas" value={stats?.warehouse.dimensions.dates} />
            <WarehouseCount label="Dim acciones" value={stats?.warehouse.dimensions.apiActions} />
            <WarehouseCount label="Dim jugadores" value={stats?.warehouse.dimensions.players} />
            <WarehouseCount label="Dim cosmeticos" value={stats?.warehouse.dimensions.cosmetics} />
            <WarehouseCount label="Fact API" value={stats?.warehouse.facts.apiCalls} />
            <WarehouseCount label="Fact tienda" value={stats?.warehouse.facts.shopAppearances} />
            <WarehouseCount label="Fact progreso" value={stats?.warehouse.facts.playerProgress} />
            <WarehouseCount label="Stream ventanas" value={stats?.warehouse.streamMetrics.length} />
            <WarehouseCount label="DLQ" value={stats?.warehouse.deadLetters} />
            <WarehouseCount label="Cache snapshots" value={stats?.cache.snapshots} />
          </div>
        </div>

        <div className="bg-miyu-surface border border-miyu-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold flex items-center gap-2 text-miyu-text mb-5 uppercase tracking-widest">
            <ShoppingBag className="w-4 h-4 text-miyu-accent" /> ML Tienda
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <WarehouseCount label="Cosmeticos" value={stats?.shop.cosmetics} />
            <WarehouseCount label="Apariciones" value={stats?.shop.cosmeticAppearances} />
            <WarehouseCount label="Snapshots" value={stats?.shop.dailySnapshots} />
            <WarehouseCount label="Predicciones" value={stats?.shop.predictions} />
          </div>
        </div>
      </div>

      {/* Data Flow Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {/* Traffic Chart */}
        <div className="lg:col-span-2 bg-miyu-surface border border-miyu-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-sm font-bold flex items-center gap-2 text-miyu-text uppercase tracking-widest">
              <BarChart className="w-4 h-4 text-miyu-accent" /> Tráfico de Eventos (24h)
            </h2>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-miyu-accent-light rounded-full text-[10px] text-miyu-accent font-bold uppercase tracking-widest">
              <div className="w-1.5 h-1.5 rounded-full bg-miyu-accent animate-pulse" /> En_Vivo
            </div>
          </div>
          <div className="h-[300px]">
            {stats?.hourlyStats.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.hourlyStats.slice().reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dfd8cc" vertical={false} />
                  <XAxis 
                    dataKey="hour" 
                    tickFormatter={(val) => new Date(val).getHours() + "h"} 
                    stroke="#615f5a" 
                    fontSize={10} 
                    fontFamily="var(--font-space-mono)"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke="#615f5a" fontSize={10} fontFamily="var(--font-space-mono)" tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #dfd8cc", borderRadius: "12px", fontFamily: "inherit" }}
                    labelStyle={{ fontWeight: "bold", fontSize: "10px", marginBottom: "4px" }}
                    itemStyle={{ fontSize: "12px", color: "#8d72dc" }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="total" 
                    stroke="#8d72dc" 
                    strokeWidth={2}
                    fill="#8d72dc" 
                    fillOpacity={0.08} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-miyu-border text-[10px] uppercase tracking-widest text-miyu-text-muted">
                esperando eventos
              </div>
            )}
          </div>
        </div>

        {/* Source Distribution */}
        <div className="bg-miyu-surface border border-miyu-border rounded-2xl p-6 shadow-sm flex flex-col">
          <h2 className="text-sm font-bold flex items-center gap-2 text-miyu-text mb-6 uppercase tracking-widest">
            <Layers className="w-4 h-4 text-miyu-accent" /> Distribución por Fuente
          </h2>
          <div className="h-[220px] mb-6">
            {stats?.callsBySource.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.callsBySource}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="total"
                    nameKey="api_source"
                    stroke="none"
                  >
                    {stats.callsBySource.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #dfd8cc", borderRadius: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-miyu-border text-[10px] uppercase tracking-widest text-miyu-text-muted">
                sin fuentes
              </div>
            )}
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto pr-2">
             {stats?.callsBySource.map((s, i) => (
               <div key={s.api_source} className="flex items-center justify-between text-xs">
                 <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                   <span className="text-miyu-text-muted capitalize">{s.api_source}</span>
                 </div>
                 <span className="text-miyu-text font-bold">{s.total}</span>
               </div>
             ))}
             {stats?.callsBySource.length === 0 && (
               <p className="py-6 text-center text-[10px] uppercase tracking-widest text-miyu-text-muted">
                 sin eventos todavia
               </p>
             )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 mb-10 lg:grid-cols-2">
        <div className="bg-miyu-surface border border-miyu-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold flex items-center gap-2 text-miyu-text mb-5 uppercase tracking-widest">
            <BarChart className="w-4 h-4 text-miyu-accent" /> Confiabilidad Warehouse
          </h2>
          <div className="overflow-hidden rounded-xl border border-miyu-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-miyu-bg text-[10px] uppercase tracking-widest text-miyu-text-muted">
                <tr>
                  <th className="px-3 py-3">fecha</th>
                  <th className="px-3 py-3">accion</th>
                  <th className="px-3 py-3 text-right">calls</th>
                  <th className="px-3 py-3 text-right">error %</th>
                  <th className="px-3 py-3 text-right">avg ms</th>
                </tr>
              </thead>
              <tbody>
                {stats?.warehouse.reliability.map((row) => (
                  <tr key={`${row.dateKey}-${row.apiSource}-${row.action}`} className="border-t border-miyu-border">
                    <td className="px-3 py-3 font-mono text-miyu-text-muted">{new Date(row.dateKey).toLocaleDateString("es-MX")}</td>
                    <td className="px-3 py-3 font-semibold text-miyu-text">{row.action}</td>
                    <td className="px-3 py-3 text-right font-mono">{row.totalCalls}</td>
                    <td className="px-3 py-3 text-right font-mono">{row.errorRatePct.toFixed(1)}%</td>
                    <td className="px-3 py-3 text-right font-mono">{row.avgDurationMs.toFixed(0)}</td>
                  </tr>
                ))}
                {stats?.warehouse.reliability.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-[10px] uppercase tracking-widest text-miyu-text-muted">
                      sin metricas de warehouse
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-miyu-surface border border-miyu-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold flex items-center gap-2 text-miyu-text mb-5 uppercase tracking-widest">
            <ShoppingBag className="w-4 h-4 text-miyu-accent" /> Predicciones de Tienda
          </h2>
          <div className="space-y-3">
            {stats?.shop.latestPredictions.map((prediction) => (
              <div key={prediction.cosmeticKey} className="rounded-xl border border-miyu-border bg-miyu-bg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-miyu-text">{prediction.name}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-widest text-miyu-text-muted">
                      {prediction.type || "item"} · {prediction.rarity || "sin rareza"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold text-miyu-text">
                      {Math.round(prediction.predictedDaysUntilNext)}d
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-miyu-text-muted">
                      conf {(prediction.confidenceScore * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-miyu-text-muted">
                  Próxima fecha estimada: {new Date(prediction.predictedNextShopDate).toLocaleDateString("es-MX")}
                </p>
              </div>
            ))}
            {stats?.shop.latestPredictions.length === 0 && (
              <div className="rounded-xl border border-dashed border-miyu-border bg-miyu-bg p-8 text-center text-[10px] uppercase tracking-widest text-miyu-text-muted">
                ejecuta docker-compose --profile batch run --rm cosmetic-predictor despues de ingerir historial
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Debugging Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Live Inspector */}
        <div className="lg:col-span-8 bg-miyu-surface border border-miyu-border rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-miyu-border flex justify-between items-center bg-miyu-bg/30">
            <div className="flex items-center gap-3">
               <div className="p-2 bg-miyu-accent/10 rounded-lg text-miyu-accent">
                 <Terminal className="w-4 h-4" />
               </div>
               <h2 className="text-sm font-bold text-miyu-text uppercase tracking-widest">
                 Inspector_en_Vivo
               </h2>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-miyu-text-muted">
               <Info className="w-3 h-3" />
               SELECCIONA_EVENTO_PARA_INSPECCIONAR
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 min-h-[450px]">
             {/* List */}
             <div className="border-r border-miyu-border overflow-y-auto max-h-[500px]">
                {stats?.recentCalls.map((call) => (
                  <button 
                    key={call.id} 
                    onClick={() => setSelectedCall(call)}
                    className={`w-full text-left p-4 border-b border-miyu-border/50 transition-all ${selectedCall?.id === call.id ? "bg-miyu-accent-light" : "hover:bg-miyu-bg/50"}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[11px] font-bold text-miyu-text uppercase font-mono tracking-tight">{call.action}</span>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${call.response_status < 400 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {call.response_status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-mono text-miyu-text-muted uppercase tracking-tighter">
                      <span>{call.api_source}</span>
                      <span>{new Date(call.created_at).toLocaleTimeString([], { hour12: false })}</span>
                    </div>
                  </button>
                ))}
             </div>
             
             {/* Preview (JSON Editor style) */}
             <div className="bg-[#1e1e1e] p-6 overflow-y-auto max-h-[500px] text-emerald-500 font-mono text-[11px] leading-relaxed">
                {selectedCall ? (
                  <div className="space-y-6">
                    <div>
                      <span className="text-slate-500">{/* metadatos */}</span>
                      <div className="mt-1 pl-4 border-l border-slate-800 space-y-1">
                        <p><span className="text-blue-400">id:</span> &quot;{selectedCall.id}&quot;</p>
                        <p><span className="text-blue-400">timestamp:</span> &quot;{selectedCall.created_at}&quot;</p>
                        <p><span className="text-blue-400">latencia:</span> {selectedCall.duration_ms}ms</p>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">{/* parametros_recibidos */}</span>
                      <pre className="mt-1 pl-4 border-l border-slate-800 text-slate-300">
                        {JSON.stringify(selectedCall.parameters, null, 2)}
                      </pre>
                    </div>
                    <div className="pt-4 mt-4 border-t border-slate-800">
                       <span className="text-slate-500 italic">{/* FIN_DEL_STREAM */}</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-600 text-center uppercase tracking-widest text-[10px]">
                    esperando_selección
                  </div>
                )}
             </div>
          </div>
        </div>

        {/* Sidebar Analytics */}
        <div className="lg:col-span-4 space-y-6">
           {/* Recent Snapshots (Simplified & Real) */}
           <div className="bg-miyu-surface border border-miyu-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-[11px] font-bold text-miyu-text-muted mb-5 flex items-center gap-2 uppercase tracking-[0.2em]">
                <User className="w-3.5 h-3.5 text-miyu-accent" /> Snapshots Recientes
              </h3>
              <div className="space-y-4">
                 {stats?.snapshots.recent.map((snap) => (
                   <div key={snap.id} className="flex items-center justify-between p-3 bg-miyu-bg rounded-xl group transition-all border border-transparent hover:border-miyu-border">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-miyu-accent-light flex items-center justify-center text-miyu-accent text-[10px] font-bold">
                           {snap.platform[0].toUpperCase()}
                         </div>
                         <div>
                            <p className="text-xs font-bold text-miyu-text leading-none mb-1">{snap.display_name || "Anónimo"}</p>
                            <p className="text-[9px] text-miyu-text-muted uppercase font-mono tracking-tighter">
                               {snap.platform} • {new Date(snap.captured_at).toLocaleTimeString([], { hour12: false })}
                            </p>
                         </div>
                      </div>
                      <ArrowRight className="w-3 h-3 text-miyu-border group-hover:text-miyu-accent transition-colors" />
                   </div>
                 ))}
                 {stats?.snapshots.recent.length === 0 && (
                   <p className="text-center py-6 text-[10px] text-miyu-text-muted italic uppercase tracking-widest">Esperando_ingesta...</p>
                 )}
              </div>
           </div>

           {/* Storage Health */}
           <div className="bg-miyu-surface border border-miyu-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-[11px] font-bold text-miyu-text-muted mb-5 flex items-center gap-2 uppercase tracking-[0.2em]">
                <HardDrive className="w-3.5 h-3.5 text-miyu-accent" /> Estado del Data Lake
              </h3>
              <div className="space-y-5">
                 <StorageIndicator label="Kafka Stream" status="activo" />
                 <StorageIndicator label="PostgreSQL" status="saludable" />
                 <StorageIndicator label="Servicio Productor" status="ejecutando" />
                 <StorageIndicator label="Worker ETL" status="esperando" />
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Helper Components
// ==========================================
function MetricTile({ label, value, icon, description }: { label: string; value: number | undefined; icon: React.ReactNode; description: string }) {
  return (
    <div className="bg-miyu-surface border border-miyu-border p-6 rounded-2xl shadow-sm hover:translate-y-[-2px] transition-all">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-miyu-accent-light rounded-lg">
          {icon}
        </div>
        <span className="text-[10px] font-mono font-bold text-miyu-text-muted uppercase tracking-widest">{label}</span>
      </div>
      <div>
        <h4 className="text-2xl font-bold text-miyu-text tabular-nums">{value?.toLocaleString() || "0"}</h4>
        <p className="text-[10px] text-miyu-text-muted mt-1 uppercase tracking-tighter">{description}</p>
      </div>
    </div>
  );
}

function WarehouseCount({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border border-miyu-border bg-miyu-bg px-4 py-3">
      <p className="text-[9px] font-mono uppercase tracking-widest text-miyu-text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-miyu-text">{(value ?? 0).toLocaleString("es-MX")}</p>
    </div>
  );
}

function StorageIndicator({ label, status }: { label: string, status: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-medium text-miyu-text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-emerald-600 font-bold uppercase">{status}</span>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
      </div>
    </div>
  );
}
