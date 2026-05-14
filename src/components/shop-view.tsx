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

function getSectionSummary(entries: ShopEntry[]) {
  const sections = new Map<string, number>();

  for (const entry of entries) {
    const section = getEntrySection(entry);
    sections.set(section, (sections.get(section) || 0) + 1);
  }

  return Array.from(sections.entries()).sort((a, b) => b[1] - a[1]);
}

export function ShopView({ shop }: { shop: ShopData }) {
  const [selectedSection, setSelectedSection] = useState("all");
  const [query, setQuery] = useState("");

  const entries = shop.entries || [];
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
            Explora la tienda actual por seccion, precio y tipo de item.
          </p>
        </div>

        <div className="rounded-2xl border border-miyu-border bg-white/80 px-4 py-3 text-right">
          <div className="text-xs font-mono text-miyu-text-muted">{formatDate(shop.date)}</div>
          <div className="mt-1 text-sm font-semibold text-miyu-text">
            {entries.length.toLocaleString("es-MX")} ofertas
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-2xl border border-miyu-border bg-white/80 p-4">
          <label className="mb-2 block text-xs font-mono text-miyu-text-muted">
            buscar en tienda
          </label>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="skins, pistas, bundles..."
            className="w-full rounded-xl border border-miyu-border bg-miyu-bg px-4 py-3 text-sm text-miyu-text placeholder-miyu-text-muted/60 outline-none transition-colors focus:border-miyu-accent"
          />
        </div>

        <div className="rounded-2xl border border-miyu-border bg-white/80 p-4">
          <div className="text-xs font-mono text-miyu-text-muted">hash</div>
          <div className="mt-1 truncate font-mono text-sm text-miyu-text">{shop.hash || "—"}</div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedSection("all")}
          className={`rounded-full px-4 py-2 text-sm transition-colors ${
            selectedSection === "all"
              ? "bg-miyu-accent text-white"
              : "border border-miyu-border bg-white text-miyu-text-muted hover:bg-miyu-accent-light hover:text-miyu-text"
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
                ? "bg-miyu-accent text-white"
                : "border border-miyu-border bg-white text-miyu-text-muted hover:bg-miyu-accent-light hover:text-miyu-text"
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
    </section>
  );
}
