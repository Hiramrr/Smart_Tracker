import { getClient, query } from "@/lib/db";

const FORTNITE_API_BASE = "https://fortnite-api.com/v2";
const INCLUDE_SHOP_HISTORY = 4;
const INCLUDE_ALL_COSMETIC_FLAGS = 7;

type JsonRecord = Record<string, unknown>;

export type CosmeticSearchResult = {
  id: string;
  name: string;
  type: string | null;
  rarity: string | null;
  series: string | null;
  setName: string | null;
  addedAt: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  shopAppearances: number;
  imageIcon: string | null;
  imageFeatured: string | null;
  raw: JsonRecord;
};

export type CosmeticIngestSummary = {
  source: string;
  mode: "single" | "catalog" | "shop";
  cosmeticsUpserted: number;
  appearancesUpserted: number;
  shopEntriesUpserted: number;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dateOnly(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  return text.slice(0, 10);
}

function fieldDisplayValue(value: unknown): string | null {
  const record = asRecord(value);
  return asString(record.displayValue) || asString(record.name) || asString(record.value);
}

function getImage(cosmetic: JsonRecord, key: "icon" | "featured" | "smallIcon"): string | null {
  return asString(asRecord(cosmetic.images)[key]);
}

function normalizeCosmetic(cosmetic: JsonRecord): CosmeticSearchResult | null {
  const id = asString(cosmetic.id);
  const name = asString(cosmetic.name);
  if (!id || !name) return null;

  const shopHistory = asRecordArray(cosmetic.shopHistory).length
    ? asRecordArray(cosmetic.shopHistory).map((item) => asString(item.date)).filter(Boolean) as string[]
    : Array.isArray(cosmetic.shopHistory)
      ? cosmetic.shopHistory.map(asString).filter(Boolean) as string[]
      : [];

  return {
    id,
    name,
    type: fieldDisplayValue(cosmetic.type),
    rarity: fieldDisplayValue(cosmetic.rarity),
    series: fieldDisplayValue(cosmetic.series),
    setName: fieldDisplayValue(cosmetic.set),
    addedAt: asString(cosmetic.added),
    firstSeen: shopHistory[0] || null,
    lastSeen: shopHistory[shopHistory.length - 1] || null,
    shopAppearances: shopHistory.length,
    imageIcon: getImage(cosmetic, "icon") || getImage(cosmetic, "smallIcon"),
    imageFeatured: getImage(cosmetic, "featured"),
    raw: cosmetic,
  };
}

async function fetchFortniteApi(path: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(`${FORTNITE_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json();

  if (!response.ok || payload?.status >= 400) {
    throw new Error(asString(payload?.error) || `Fortnite-API respondió ${response.status}`);
  }

  return payload as JsonRecord;
}

export async function fetchCosmeticBySearch(search: { id?: string; name?: string; language?: string }) {
  const params = new URLSearchParams({
    responseFlags: String(INCLUDE_ALL_COSMETIC_FLAGS),
    language: search.language || "es-419",
  });
  if (search.id) params.set("id", search.id);
  if (search.name) {
    params.set("name", search.name);
    params.set("searchLanguage", search.language || "es-419");
  }

  const payload = await fetchFortniteApi(`/cosmetics/br/search?${params.toString()}`);
  const cosmetic = normalizeCosmetic(asRecord(payload.data));
  if (!cosmetic) throw new Error("Cosmetico no encontrado");
  return cosmetic;
}

export async function fetchCosmeticCatalog(language = "es-419") {
  const params = new URLSearchParams({
    responseFlags: String(INCLUDE_SHOP_HISTORY),
    language,
  });
  const payload = await fetchFortniteApi(`/cosmetics/br?${params.toString()}`);
  return asRecordArray(payload.data).map(normalizeCosmetic).filter(Boolean) as CosmeticSearchResult[];
}

export async function fetchCurrentShop(language = "es-419") {
  const params = new URLSearchParams({ language });
  return fetchFortniteApi(`/shop?${params.toString()}`);
}

export async function upsertCosmetic(cosmetic: CosmeticSearchResult): Promise<number> {
  await query(
    `INSERT INTO cosmetics (
      cosmetic_id, name, description, type, rarity, series, set_name,
      introduced_chapter, introduced_season, added_at, image_icon,
      image_featured, gameplay_tags, variants, raw_json, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11,
      $12, $13, $14, $15, NOW()
    )
    ON CONFLICT (cosmetic_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      type = EXCLUDED.type,
      rarity = EXCLUDED.rarity,
      series = EXCLUDED.series,
      set_name = EXCLUDED.set_name,
      introduced_chapter = EXCLUDED.introduced_chapter,
      introduced_season = EXCLUDED.introduced_season,
      added_at = EXCLUDED.added_at,
      image_icon = EXCLUDED.image_icon,
      image_featured = EXCLUDED.image_featured,
      gameplay_tags = EXCLUDED.gameplay_tags,
      variants = EXCLUDED.variants,
      raw_json = EXCLUDED.raw_json,
      updated_at = NOW()`,
    [
      cosmetic.id,
      cosmetic.name,
      asString(cosmetic.raw.description),
      cosmetic.type,
      cosmetic.rarity,
      cosmetic.series,
      cosmetic.setName,
      asNumber(asRecord(cosmetic.raw.introduction).chapter),
      asNumber(asRecord(cosmetic.raw.introduction).season) || asNumber(asRecord(cosmetic.raw.introduction).backendValue),
      cosmetic.addedAt,
      cosmetic.imageIcon,
      cosmetic.imageFeatured,
      JSON.stringify(Array.isArray(cosmetic.raw.gameplayTags) ? cosmetic.raw.gameplayTags : []),
      JSON.stringify(Array.isArray(cosmetic.raw.variants) ? cosmetic.raw.variants : []),
      JSON.stringify(cosmetic.raw),
    ]
  );
  return 1;
}

export async function upsertShopHistory(cosmetic: CosmeticSearchResult, source = "fortnite-api"): Promise<number> {
  const dates = Array.isArray(cosmetic.raw.shopHistory)
    ? cosmetic.raw.shopHistory.map(dateOnly).filter(Boolean) as string[]
    : [];

  if (dates.length === 0) return 0;

  const client = await getClient();
  try {
    let count = 0;
    await client.query("BEGIN");
    for (const shopDate of dates) {
      await client.query(
        `INSERT INTO cosmetic_shop_appearances (cosmetic_id, shop_date, source)
         VALUES ($1, $2, $3)
         ON CONFLICT (cosmetic_id, shop_date, source) DO NOTHING`,
        [cosmetic.id, shopDate, source]
      );
      count += 1;
    }
    await client.query("COMMIT");
    return count;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertShopSnapshot(shopPayload: JsonRecord, source = "fortnite-api"): Promise<CosmeticIngestSummary> {
  const payloadData = asRecord(shopPayload.data);
  const shop = Object.keys(payloadData).length > 0 ? payloadData : shopPayload;
  const shopDate = dateOnly(shop.date) || new Date().toISOString().slice(0, 10);
  const entries = asRecordArray(shop.entries);
  let cosmeticsUpserted = 0;
  let shopEntriesUpserted = 0;

  await query(
    `INSERT INTO daily_shop_snapshots (shop_date, hash, entries_count, raw_json, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (shop_date, source)
     DO UPDATE SET
       hash = EXCLUDED.hash,
       entries_count = EXCLUDED.entries_count,
       raw_json = EXCLUDED.raw_json,
       captured_at = NOW()`,
    [shopDate, asString(shop.hash), entries.length, JSON.stringify(shop), source]
  );

  for (const entry of entries) {
    const cosmetics = [
      ...asRecordArray(entry.brItems),
      ...asRecordArray(entry.instruments),
      ...asRecordArray(entry.cars),
      ...asRecordArray(entry.tracks),
      ...asRecordArray(entry.legoKits),
    ];

    for (const rawCosmetic of cosmetics) {
      const cosmetic = normalizeCosmetic(rawCosmetic);
      if (!cosmetic) continue;
      await upsertCosmetic(cosmetic);
      cosmeticsUpserted += 1;

      await query(
        `INSERT INTO cosmetic_shop_appearances (
          cosmetic_id, shop_date, source, offer_id, regular_price, final_price,
          in_date, out_date, giftable, refundable, layout_id, tile_size, raw_entry
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (cosmetic_id, shop_date, source)
        DO UPDATE SET
          offer_id = EXCLUDED.offer_id,
          regular_price = EXCLUDED.regular_price,
          final_price = EXCLUDED.final_price,
          in_date = EXCLUDED.in_date,
          out_date = EXCLUDED.out_date,
          giftable = EXCLUDED.giftable,
          refundable = EXCLUDED.refundable,
          layout_id = EXCLUDED.layout_id,
          tile_size = EXCLUDED.tile_size,
          raw_entry = EXCLUDED.raw_entry,
          ingested_at = NOW()`,
        [
          cosmetic.id,
          shopDate,
          source,
          asString(entry.offerId),
          asNumber(entry.regularPrice),
          asNumber(entry.finalPrice),
          asString(entry.inDate),
          asString(entry.outDate),
          Boolean(entry.giftable),
          Boolean(entry.refundable),
          asString(entry.layoutId),
          asString(entry.tileSize),
          JSON.stringify(entry),
        ]
      );
      shopEntriesUpserted += 1;
    }
  }

  return {
    source,
    mode: "shop",
    cosmeticsUpserted,
    appearancesUpserted: shopEntriesUpserted,
    shopEntriesUpserted,
  };
}

export async function ingestSingleCosmetic(search: { id?: string; name?: string; language?: string }) {
  const cosmetic = await fetchCosmeticBySearch(search);
  const cosmeticsUpserted = await upsertCosmetic(cosmetic);
  const appearancesUpserted = await upsertShopHistory(cosmetic);

  return {
    summary: {
      source: "fortnite-api",
      mode: "single" as const,
      cosmeticsUpserted,
      appearancesUpserted,
      shopEntriesUpserted: 0,
    },
    cosmetic,
  };
}

export async function ingestCatalog(language = "es-419", limit?: number) {
  const cosmetics = await fetchCosmeticCatalog(language);
  const selected = typeof limit === "number" && limit > 0 ? cosmetics.slice(0, limit) : cosmetics;
  let cosmeticsUpserted = 0;
  let appearancesUpserted = 0;

  for (const cosmetic of selected) {
    cosmeticsUpserted += await upsertCosmetic(cosmetic);
    appearancesUpserted += await upsertShopHistory(cosmetic);
  }

  return {
    source: "fortnite-api",
    mode: "catalog" as const,
    cosmeticsUpserted,
    appearancesUpserted,
    shopEntriesUpserted: 0,
  };
}

export async function getCosmeticFeatures(limit = 100) {
  const result = await query(
    `SELECT *
     FROM v_cosmetic_prediction_features
     ORDER BY appearances_count DESC, days_since_last_seen ASC NULLS LAST
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}
