"use client";

import { useState } from "react";

export type ShopEntry = {
  offerId: string;
  regularPrice?: number;
  finalPrice?: number;
  inDate?: string;
  outDate?: string;
  giftable?: boolean;
  refundable?: boolean;
  tileSize?: string;
  layoutId?: string;
  layout?: {
    id?: string;
    name?: string;
    displayType?: string;
  };
  bundle?: {
    name?: string;
    info?: string;
    image?: string;
  };
  brItems?: Array<{
    id?: string;
    name?: string;
    description?: string;
    type?: { displayValue?: string };
    rarity?: { displayValue?: string };
    images?: { icon?: string; featured?: string };
  }>;
  tracks?: Array<{
    id?: string;
    title?: string;
    artist?: string;
    albumArt?: string;
  }>;
  instruments?: Array<{
    id?: string;
    name?: string;
    images?: { icon?: string };
  }>;
  cars?: Array<{
    id?: string;
    name?: string;
    images?: { icon?: string };
  }>;
  newDisplayAsset?: {
    renderImages?: Array<{
      image?: string;
    }>;
  };
};

export type ShopData = {
  date?: string;
  hash?: string;
  vbuckIcon?: string;
  entries?: ShopEntry[];
};

export type CosmeticPrediction = {
  cosmeticId: string;
  name: string;
  type?: string | null;
  rarity?: string | null;
  imageIcon?: string | null;
  imageFeatured?: string | null;
  appearancesCount?: number;
  daysSinceLastSeen?: number;
  predictedDaysUntilNext: number;
  predictedNextShopDate: string;
  confidenceScore: number;
  avgDaysBetweenAppearances?: number;
  estimatedDaysUntilNextShop?: number;
  stddevDaysBetweenAppearances?: number;
  avgBlockDuration?: number;
  maxBlockDuration?: number;
};

function getEntrySection(entry: ShopEntry) {
  return entry.layout?.name || entry.layoutId || "Sin seccion";
}

function getEntryTitle(entry: ShopEntry) {
  return (
    entry.bundle?.name ||
    entry.brItems?.[0]?.name ||
    entry.tracks?.[0]?.title ||
    entry.instruments?.[0]?.name ||
    entry.cars?.[0]?.name ||
    "Oferta sin nombre"
  );
}

function getEntrySubtitle(entry: ShopEntry) {
  if (entry.bundle?.info) return entry.bundle.info;
  if (entry.tracks?.[0]?.artist) return entry.tracks[0].artist;
  if (entry.brItems?.[0]?.type?.displayValue) return entry.brItems[0].type.displayValue;
  if (entry.brItems?.[0]?.rarity?.displayValue) return entry.brItems[0].rarity.displayValue;
  return "Articulo de tienda";
}

function getEntryImage(entry: ShopEntry) {
  return (
    entry.bundle?.image ||
    entry.newDisplayAsset?.renderImages?.[0]?.image ||
    entry.brItems?.[0]?.images?.featured ||
    entry.brItems?.[0]?.images?.icon ||
    entry.tracks?.[0]?.albumArt ||
    entry.instruments?.[0]?.images?.icon ||
    entry.cars?.[0]?.images?.icon ||
    null
  );
}

function getEntryItemIds(entry: ShopEntry) {
  return [
    ...(entry.brItems || []).map((item) => item.id),
    ...(entry.tracks || []).map((item) => item.id),
    ...(entry.instruments || []).map((item) => item.id),
    ...(entry.cars || []).map((item) => item.id),
  ].filter((id): id is string => Boolean(id));
}

function formatDate(date: string | undefined) {
  if (!date) return "sin fecha";
  return new Date(date).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("es-MX") : "—";
}

function formatShortDate(date: string | undefined | null) {
  if (!date) return "sin fecha";
  return new Date(date).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function fmtDays(value: number | undefined) {
  if (!value || value <= 0) return "—";
  return `${Math.round(value).toLocaleString("es-MX")}d`;
}

function getSectionSummary(entries: ShopEntry[]) {
  const sections = new Map<string, number>();

  for (const entry of entries) {
    const section = getEntrySection(entry);
    sections.set(section, (sections.get(section) || 0) + 1);
  }

  return Array.from(sections.entries()).sort((a, b) => b[1] - a[1]);
}

export function ShopView({
  shop,
  predictions = [],
}: {
  shop: ShopData;
  predictions?: CosmeticPrediction[];
}) {
  const [selectedSection, setSelectedSection] = useState("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"shop" | "predictions">("shop");
  const [predictionQuery, setPredictionQuery] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<
    | null
    | {
        cosmetic: {
          id: string;
          name: string;
          type: string | null;
          rarity: string | null;
          imageIcon: string | null;
          imageFeatured: string | null;
          shopAppearances: number;
        };
        features: Record<string, unknown> | null;
        prediction: {
          predicted_days_until_next: number;
          predicted_next_shop_date: string;
          confidence_score: number;
        } | null;
      }
  >(null);

  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyResult, setHistoryResult] = useState<
    | null
    | { daysProcessed: number; appearancesUpserted: number; shopEntriesUpserted: number }
  >(null);

  async function handleSearchCosmetic(event: React.FormEvent) {
    event.preventDefault();
    if (!searchName.trim()) return;
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const res = await fetch(
        `/api/cosmetics/predict?name=${encodeURIComponent(searchName.trim())}`
      );
      const data = await res.json();
      if (data.success) {
        setSearchResult(data);
      } else {
        alert(data.error || "No se encontro el cosmetico");
      }
    } catch {
      alert("Error buscando cosmetico");
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleIngestHistory(event: React.FormEvent) {
    event.preventDefault();
    if (!historyFrom || !historyTo) return;
    setHistoryLoading(true);
    setHistoryResult(null);
    try {
      const res = await fetch(
        `/api/cosmetics/ingest?mode=shop-history&from=${encodeURIComponent(historyFrom)}&to=${encodeURIComponent(historyTo)}`
      );
      const data = await res.json();
      if (data.success && data.summary) {
        setHistoryResult(data.summary);
      } else {
        alert(data.error || "Error ingiriendo historial");
      }
    } catch {
      alert("Error ingiriendo historial de tiendas");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSearchFallback() {
    if (!predictionQuery.trim()) return;
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const res = await fetch(
        `/api/cosmetics/predict?name=${encodeURIComponent(predictionQuery.trim())}`
      );
      const data = await res.json();
      if (data.success) {
        setSearchResult(data);
      } else {
        alert(data.error || "No se encontro el cosmetico");
      }
    } catch {
      alert("Error buscando cosmetico");
    } finally {
      setSearchLoading(false);
    }
  }

  const entries = shop.entries || [];
  const predictionsById = new Map(predictions.map((prediction) => [prediction.cosmeticId, prediction]));
  const visiblePredictions = predictions.filter((prediction) => {
    const haystack = `${prediction.name} ${prediction.type || ""} ${prediction.rarity || ""}`.toLowerCase();
    return predictionQuery.trim()
      ? haystack.includes(predictionQuery.trim().toLowerCase())
      : true;
  });
  const sectionSummary = getSectionSummary(entries);
  const visibleEntries = entries.filter((entry) => {
    const matchesSection =
      selectedSection === "all" || getEntrySection(entry) === selectedSection;
    const haystack = `${getEntryTitle(entry)} ${getEntrySubtitle(entry)} ${getEntrySection(entry)}`.toLowerCase();
    const matchesQuery = query.trim() ? haystack.includes(query.trim().toLowerCase()) : true;
    return matchesSection && matchesQuery;
  });

  return (
    <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-miyu-text-muted">
            tienda del dia
          </p>
          <h1 className="text-3xl font-bold text-miyu-text">rotacion de hoy</h1>
          <p className="max-w-2xl text-sm text-miyu-text-muted">
            Explora la tienda actual por seccion, precio y tipo de item. Si el modelo batch ya genero resultados,
            cada articulo muestra su prediccion de regreso.
          </p>
        </div>

        <div className="rounded-2xl border border-miyu-border bg-white/80 px-4 py-3 text-right">
          <div className="text-xs font-mono text-miyu-text-muted">{formatDate(shop.date)}</div>
          <div className="mt-1 text-sm font-semibold text-miyu-text">
            {entries.length.toLocaleString("es-MX")} ofertas
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-miyu-border bg-white/80 p-2">
        <button
          type="button"
          onClick={() => setView("shop")}
          className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
            view === "shop"
              ? "bg-miyu-btn text-miyu-text shadow-sm"
              : "text-miyu-text-muted hover:bg-miyu-bg"
          }`}
        >
          Tienda de hoy
        </button>
        <button
          type="button"
          onClick={() => setView("predictions")}
          className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
            view === "predictions"
              ? "bg-miyu-btn text-miyu-text shadow-sm"
              : "text-miyu-text-muted hover:bg-miyu-bg"
          }`}
        >
          Predicciones ({predictions.length.toLocaleString("es-MX")})
        </button>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-2xl border border-miyu-border bg-white/80 p-4">
          <label className="mb-2 block text-xs font-mono text-miyu-text-muted">
            {view === "shop" ? "buscar en tienda" : "buscar prediccion"}
          </label>
          <input
            type="text"
            value={view === "shop" ? query : predictionQuery}
            onChange={(event) => {
              if (view === "shop") setQuery(event.target.value);
              else setPredictionQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (view === "predictions" && event.key === "Enter" && predictionQuery.trim() && visiblePredictions.length === 0) {
                handleSearchFallback();
              }
            }}
            placeholder={view === "shop" ? "skins, pistas, bundles..." : "nombre, rareza, tipo..."}
            className="w-full rounded-xl border border-miyu-border bg-miyu-bg px-4 py-3 text-sm text-miyu-text placeholder-miyu-text-muted/60 outline-none transition-colors focus:border-miyu-accent"
          />
        </div>

        <div className="rounded-2xl border border-miyu-border bg-white/80 p-4">
          <div className="text-xs font-mono text-miyu-text-muted">
            {view === "shop" ? "hash" : "modelo"}
          </div>
          <div className="mt-1 truncate font-mono text-sm text-miyu-text">
            {view === "shop" ? shop.hash || "—" : "Random Forest"}
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-miyu-border bg-white/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-miyu-text-muted">
              modelo batch / ml
            </p>
            <p className="mt-1 text-sm text-miyu-text">
              {predictions.length > 0
                ? `${predictions.length.toLocaleString("es-MX")} predicciones disponibles desde el mart de cosmeticos.`
                : "Aun no hay predicciones guardadas; ingiere historial y ejecuta el job batch cosmetic-predictor."}
            </p>
          </div>
          <div className="rounded-xl bg-miyu-accent-light px-4 py-2 text-xs font-bold uppercase tracking-widest text-miyu-accent">
            Random Forest
          </div>
        </div>
      </div>

      {view === "predictions" && (
        <form onSubmit={handleIngestHistory} className="mb-6 rounded-2xl border border-miyu-border bg-white/80 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="mb-1 block text-xs font-mono text-miyu-text-muted">desde</label>
              <input
                type="date"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
                className="w-full rounded-xl border border-miyu-border bg-miyu-bg px-3 py-2 text-sm text-miyu-text outline-none focus:border-miyu-accent"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="mb-1 block text-xs font-mono text-miyu-text-muted">hasta</label>
              <input
                type="date"
                value={historyTo}
                onChange={(e) => setHistoryTo(e.target.value)}
                className="w-full rounded-xl border border-miyu-border bg-miyu-bg px-3 py-2 text-sm text-miyu-text outline-none focus:border-miyu-accent"
              />
            </div>
            <button
              type="submit"
              disabled={historyLoading || !historyFrom || !historyTo}
              className="rounded-xl bg-miyu-btn px-4 py-2 text-sm font-semibold text-miyu-text transition-colors hover:bg-miyu-btn-hover disabled:opacity-50"
            >
              {historyLoading ? "Ingiriendo..." : "Ingerir historial"}
            </button>
          </div>
          {historyResult && (
            <p className="mt-2 text-xs text-miyu-text-muted">
              Procesadas {historyResult.daysProcessed} días · {historyResult.appearancesUpserted} apariciones · {historyResult.shopEntriesUpserted} entradas guardadas.
            </p>
          )}
          <p className="mt-2 text-[10px] text-miyu-text-muted">
            Ingiere tiendas diarias de Fortnite para un rango de fechas. Solo se guardan días con datos disponibles.
          </p>
        </form>
      )}

      {view === "predictions" ? (
        <>
          <form onSubmit={handleSearchCosmetic} className="mb-6 rounded-2xl border border-miyu-border bg-white/80 p-4">
            <label className="mb-2 block text-xs font-mono text-miyu-text-muted">
              buscar cosmetico especifico
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="ej: Renegade Raider, Aura..."
                className="min-w-0 flex-1 rounded-xl border border-miyu-border bg-miyu-bg px-4 py-3 text-sm text-miyu-text placeholder-miyu-text-muted/60 outline-none transition-colors focus:border-miyu-accent"
              />
              <button
                type="submit"
                disabled={searchLoading}
                className="rounded-xl bg-miyu-btn px-5 py-3 text-sm font-semibold text-miyu-text transition-colors hover:bg-miyu-btn-hover disabled:opacity-50"
              >
                {searchLoading ? "Buscando..." : "Buscar"}
              </button>
            </div>
            <p className="mt-2 text-xs text-miyu-text-muted">
              Busca cualquier cosmético por nombre. Si tiene historial de tienda suficiente, calculamos una predicción en tiempo real.
            </p>
          </form>

          {searchResult && (
            <SearchResultCard result={searchResult} />
          )}

          <PredictionGrid
            predictions={visiblePredictions}
            searchQuery={predictionQuery}
            onSearchApi={handleSearchFallback}
          />
        </>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSection("all")}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                selectedSection === "all"
                  ? "border border-miyu-text bg-miyu-btn text-miyu-text"
                  : "border border-miyu-border bg-miyu-btn text-miyu-text hover:bg-miyu-btn-hover"
              }`}
            >
              todas
            </button>
            {sectionSummary.map(([section, count]) => (
          <button
            key={section}
            onClick={() => setSelectedSection(section)}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${
              selectedSection === section
                ? "border border-miyu-text bg-miyu-btn text-miyu-text"
                : "border border-miyu-border bg-miyu-btn text-miyu-text hover:bg-miyu-btn-hover"
            }`}
          >
            {section} ({count})
          </button>
            ))}
          </div>

          {visibleEntries.length === 0 ? (
            <div className="rounded-2xl border border-miyu-border bg-white/80 p-8 text-center text-sm text-miyu-text-muted">
              No encontramos articulos con ese filtro.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleEntries.map((entry) => {
                const image = getEntryImage(entry);
                const title = getEntryTitle(entry);
                const subtitle = getEntrySubtitle(entry);
                const prediction = getEntryItemIds(entry)
                  .map((id) => predictionsById.get(id))
                  .find(Boolean);
                const isDiscounted =
                  typeof entry.regularPrice === "number" &&
                  typeof entry.finalPrice === "number" &&
                  entry.regularPrice > entry.finalPrice;

                return (
                  <article
                    key={entry.offerId}
                    className="overflow-hidden rounded-2xl border border-miyu-border bg-white shadow-[0_8px_24px_rgba(30,57,50,0.06)]"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-miyu-accent-light">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt={title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-miyu-text-muted">
                          sin imagen
                        </div>
                      )}
                      <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-miyu-text">
                        {getEntrySection(entry)}
                      </div>
                    </div>

                    <div className="space-y-4 p-4">
                      <div className="space-y-1">
                        <h2 className="text-lg font-bold text-miyu-text">{title}</h2>
                        <p className="text-sm text-miyu-text-muted">{subtitle}</p>
                      </div>

                      {prediction && (
                        <div className="rounded-xl border border-miyu-border bg-miyu-bg p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-miyu-text-muted">
                              prediccion regreso
                            </span>
                            <span className="font-mono text-sm font-bold text-miyu-text">
                              {Math.round(prediction.predictedDaysUntilNext)} dias
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-miyu-text-muted">
                            <span>{formatDate(prediction.predictedNextShopDate)}</span>
                            <span>{Math.round(prediction.confidenceScore * 100)}% confianza</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-miyu-text">
                              {formatPrice(entry.finalPrice)}
                            </span>
                            <span className="text-sm text-miyu-text-muted">v-bucks</span>
                          </div>
                          {isDiscounted && (
                            <div className="text-xs text-miyu-text-muted line-through">
                              {formatPrice(entry.regularPrice)}
                            </div>
                          )}
                        </div>

                        <div className="text-right text-xs text-miyu-text-muted">
                          <div>{entry.giftable ? "regalable" : "sin regalo"}</div>
                          <div>{entry.refundable ? "reembolsable" : "sin reembolso"}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-miyu-border pt-3 text-xs text-miyu-text-muted">
                        <span>sale: {formatDate(entry.outDate)}</span>
                        <span>{entry.tileSize || "tile"}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PredictionGrid({
  predictions,
  searchQuery,
  onSearchApi,
}: {
  predictions: CosmeticPrediction[];
  searchQuery?: string;
  onSearchApi?: () => void;
}) {
  if (predictions.length === 0) {
    return (
      <div className="rounded-2xl border border-miyu-border bg-white/80 p-8 text-center">
        <p className="text-sm text-miyu-text-muted">No hay predicciones con ese filtro.</p>
        {searchQuery?.trim() && onSearchApi && (
          <button
            type="button"
            onClick={onSearchApi}
            className="mt-4 rounded-xl bg-miyu-btn px-4 py-2 text-sm font-semibold text-miyu-text transition-colors hover:bg-miyu-btn-hover"
          >
            Buscar "{searchQuery.trim()}" en API de Fortnite
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {predictions.map((prediction) => {
        const image = prediction.imageFeatured || prediction.imageIcon;
        const stddev = prediction.stddevDaysBetweenAppearances;
        return (
          <article
            key={prediction.cosmeticId}
            className="overflow-hidden rounded-2xl border border-miyu-border bg-white shadow-[0_8px_24px_rgba(30,57,50,0.06)]"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-miyu-accent-light">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={prediction.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-miyu-text-muted">
                  sin imagen
                </div>
              )}
              <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-miyu-text">
                {prediction.rarity || "cosmetico"}
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div>
                <h2 className="text-lg font-bold text-miyu-text">{prediction.name}</h2>
                <p className="mt-1 text-sm text-miyu-text-muted">{prediction.type || "Articulo de tienda"}</p>
              </div>

              <div className="rounded-xl border border-miyu-border bg-miyu-bg p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-miyu-text-muted">
                      Regreso estimado
                    </p>
                    <p className="mt-1 text-2xl font-bold text-miyu-text">
                      En {Math.round(prediction.predictedDaysUntilNext)} días
                    </p>
                    <p className="text-xs text-miyu-text-muted">
                      Aprox. {formatShortDate(prediction.predictedNextShopDate)}
                    </p>
                  </div>
                  <div className="rounded-full bg-miyu-accent-light px-3 py-1 text-xs font-bold text-miyu-accent">
                    {Math.round(prediction.confidenceScore * 100)}%
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-miyu-border bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-miyu-text-muted mb-3">
                  ¿Por qué esta fecha?
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-miyu-border p-2.5">
                    <p className="text-miyu-text-muted">Sin verse</p>
                    <p className="mt-0.5 text-base font-bold text-miyu-text">
                      {fmtDays(prediction.daysSinceLastSeen)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-miyu-border p-2.5">
                    <p className="text-miyu-text-muted">Apariciones totales</p>
                    <p className="mt-0.5 text-base font-bold text-miyu-text">
                      {(prediction.appearancesCount || 0).toLocaleString("es-MX")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-miyu-border p-2.5">
                    <p className="text-miyu-text-muted">Promedio entre regresos</p>
                    <p className="mt-0.5 text-base font-bold text-miyu-text">
                      {fmtDays(prediction.avgDaysBetweenAppearances)}
                      {prediction.avgDaysBetweenAppearances && stddev ? (
                        <span className="ml-1 text-[10px] font-normal text-miyu-text-muted">
                          (±{Math.round(stddev)}d)
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="rounded-lg border border-miyu-border p-2.5">
                    <p className="text-miyu-text-muted">Estimación histórica</p>
                    <p className="mt-0.5 text-base font-bold text-miyu-accent">
                      {fmtDays(prediction.estimatedDaysUntilNextShop)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-miyu-border p-2.5">
                    <p className="text-miyu-text-muted">Días en tienda</p>
                    <p className="mt-0.5 text-base font-bold text-miyu-text">
                      {fmtDays(prediction.avgBlockDuration)}
                      {prediction.avgBlockDuration && prediction.maxBlockDuration ? (
                        <span className="ml-1 text-[10px] font-normal text-miyu-text-muted">
                          (máx {Math.round(prediction.maxBlockDuration)}d)
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-miyu-text-muted">
                  La <strong className="text-miyu-text">estimación histórica</strong> compara los días transcurridos contra el promedio de regresos. El <strong className="text-miyu-text">modelo ML</strong> ajusta este valor con rareza, tipo, temporada y otros patrones para la fecha final. Los bloques de apariciones consecutivas se tratan como una sola entrada.
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SearchResultCard({
  result,
}: {
  result: {
    cosmetic: {
      id: string;
      name: string;
      type: string | null;
      rarity: string | null;
      imageIcon: string | null;
      imageFeatured: string | null;
      shopAppearances: number;
    };
    features: Record<string, unknown> | null;
    prediction: {
      predicted_days_until_next: number;
      predicted_next_shop_date: string;
      confidence_score: number;
    } | null;
  };
}) {
  const { cosmetic, features, prediction } = result;
  const image = cosmetic.imageFeatured || cosmetic.imageIcon;
  const hasHistory = (cosmetic.shopAppearances || 0) >= 3;

  const daysSinceLastSeen = features
    ? Number(features.days_since_last_seen || 0)
    : 0;
  const avgGap = features
    ? Number(features.avg_days_between_appearances || 0)
    : 0;
  const appearancesCount = features
    ? Number(features.appearances_count || 0)
    : 0;

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-miyu-border bg-white shadow-[0_8px_24px_rgba(30,57,50,0.06)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-miyu-accent-light">
        {image ? (
          <img
            src={image}
            alt={cosmetic.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-miyu-text-muted">
            sin imagen
          </div>
        )}
        <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-miyu-text">
          {cosmetic.rarity || "cosmetico"}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <h2 className="text-lg font-bold text-miyu-text">{cosmetic.name}</h2>
          <p className="mt-1 text-sm text-miyu-text-muted">
            {cosmetic.type || "Articulo de tienda"} · {appearancesCount} apariciones en tienda
          </p>
        </div>

        {prediction ? (
          <div className="rounded-xl border border-miyu-border bg-miyu-bg p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-miyu-text-muted">
                  Regreso estimado
                </p>
                <p className="mt-1 text-2xl font-bold text-miyu-text">
                  En {Math.round(prediction.predicted_days_until_next)} días
                </p>
                <p className="text-xs text-miyu-text-muted">
                  Aprox. {formatShortDate(prediction.predicted_next_shop_date)}
                </p>
              </div>
              <div className="rounded-full bg-miyu-accent-light px-3 py-1 text-xs font-bold text-miyu-accent">
                {Math.round(prediction.confidence_score * 100)}%
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-miyu-border bg-miyu-bg p-4 text-sm text-miyu-text-muted">
            {hasHistory
              ? "No hay suficientes datos para una predicción fiable (se requieren al menos 3 apariciones distintas)."
              : "Este cosmético no tiene historial de tienda registrado en la API."}
          </div>
        )}

        {features && (
          <div className="rounded-xl border border-miyu-border bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-miyu-text-muted mb-3">
              Historial en tienda
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-miyu-border p-2.5">
                <p className="text-miyu-text-muted">Sin verse</p>
                <p className="mt-0.5 text-base font-bold text-miyu-text">
                  {fmtDays(daysSinceLastSeen)}
                </p>
              </div>
              <div className="rounded-lg border border-miyu-border p-2.5">
                <p className="text-miyu-text-muted">Apariciones totales</p>
                <p className="mt-0.5 text-base font-bold text-miyu-text">
                  {appearancesCount.toLocaleString("es-MX")}
                </p>
              </div>
              <div className="rounded-lg border border-miyu-border p-2.5">
                <p className="text-miyu-text-muted">Promedio entre regresos</p>
                <p className="mt-0.5 text-base font-bold text-miyu-text">
                  {fmtDays(avgGap)}
                </p>
              </div>
              <div className="rounded-lg border border-miyu-border p-2.5">
                <p className="text-miyu-text-muted">Estimación histórica</p>
                <p className="mt-0.5 text-base font-bold text-miyu-accent">
                  {fmtDays(
                    features.estimated_days_until_next_shop
                      ? Number(features.estimated_days_until_next_shop)
                      : 0
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
