import { Pool, PoolClient } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada");
  }

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (err) => {
    console.error("Error inesperado en el pool de PostgreSQL:", err);
  });

  return pool;
}

/**
 * Ejecuta una consulta SQL con parámetros
 */
export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  try {
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB] Consulta ejecutada en ${duration}ms: ${text.substring(0, 100)}...`);
    return result;
  } catch (error) {
    console.error("[DB] Error en consulta:", error);
    throw error;
  }
}

/**
 * Obtiene un cliente del pool para transacciones
 */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Cierra el pool de conexiones (útil para graceful shutdown)
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ==========================================
// Funciones de Cache (Cache-Aside Pattern)
// ==========================================

export interface ApiCacheEntry {
  data: unknown;
  cacheKey: string;
  action: string;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
}

/**
 * Genera una clave de cache a partir de los parámetros
 */
export function generateCacheKey(action: string, params: Record<string, unknown>): string {
  const sortedKeys = Object.keys(params).sort();
  const parts = sortedKeys.map((k) => `${k}=${params[k]}`);
  return `${action}:${parts.join("&")}`;
}

/**
 * Obtiene una entrada de cache. Cuando includeExpired es true funciona como
 * buffer local para redes donde la API externa este bloqueada.
 */
export async function getCacheEntry(
  action: string,
  params: Record<string, unknown>,
  includeExpired = false
): Promise<ApiCacheEntry | null> {
  try {
    const cacheKey = generateCacheKey(action, params);
    const result = await query(
      `SELECT cache_key, action, data, created_at, expires_at, expires_at <= NOW() AS is_expired
       FROM api_cache
       WHERE cache_key = $1 AND action = $2
         AND ($3::boolean = TRUE OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [cacheKey, action, includeExpired]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`[Cache] ${row.is_expired ? "STALE" : "HIT"} para ${cacheKey}`);
      return {
        data: row.data,
        cacheKey: row.cache_key,
        action: row.action,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        isExpired: row.is_expired,
      };
    }

    console.log(`[Cache] MISS para ${cacheKey}`);
    return null;
  } catch (error) {
    console.error("[Cache] Error al leer cache:", error);
    return null;
  }
}

/**
 * Obtiene un dato del cache si existe y no ha expirado
 */
export async function getCache(
  action: string,
  params: Record<string, unknown>
): Promise<unknown | null> {
  const entry = await getCacheEntry(action, params, false);
  return entry?.data ?? null;
}

/**
 * Guarda un dato en el cache con TTL
 */
export async function setCache(
  action: string,
  params: Record<string, unknown>,
  data: unknown,
  ttlMinutes: number
): Promise<void> {
  const cacheKey = generateCacheKey(action, params);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  try {
    await query(
      `INSERT INTO api_cache (cache_key, action, data, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cache_key, action)
       DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
      [cacheKey, action, JSON.stringify(data), expiresAt]
    );
  } catch (error) {
    console.error("[Cache] Error al guardar cache:", error);
    return;
  }

  try {
    await query(
      `INSERT INTO api_cache_snapshots (cache_key, action, data, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [cacheKey, action, JSON.stringify(data), expiresAt]
    );
  } catch (error) {
    console.warn("[Cache] No se pudo guardar snapshot histórico:", error);
  }

  console.log(`[Cache] GUARDADO ${cacheKey} (TTL: ${ttlMinutes}m)`);
}

/**
 * TTL en minutos según la acción
 */
export function getCacheTtl(action: string): number {
  switch (action) {
    case "lookup":
      return 60 * 24; // 24 horas (datos de cuenta son estables)
    case "stats":
    case "tracker-stats":
    case "fortnite-api-stats":
      return 60; // 1 hora (estadísticas cambian con frecuencia)
    case "ranked-current":
      return 15; // 15 minutos (rank cambia rápido)
    case "lol-overview":
    case "lol-matches":
      return 15; // historial reciente/ranked puede cambiar rapido
    case "lol-ranked":
      return 30;
    case "lol-mastery":
      return 60 * 6;
    case "lol-account":
    case "lol-profile":
    case "lol-static-champions":
      return 60 * 24;
    case "shop":
      return 60; // 1 hora (tienda cambia cada 24h)
    case "tournaments":
      return 60 * 6; // 6 horas
    case "player-tournament-placements":
      return 60 * 12; // 12 horas (resultados históricos cambian poco)
    case "tournament-player-stats":
      return 60 * 6; // 6 horas
    case "leaderboard":
      return 30; // 30 minutos
    default:
      return 15;
  }
}

// ==========================================
// Funciones para imágenes de torneos (BYTEA en PostgreSQL)
// ==========================================

export interface TournamentImageRecord {
  id: string;
  event_id: string;
  image_type: string;
  original_url: string;
  image_data: Buffer;
  content_type: string | null;
  size_bytes: number | null;
  downloaded_at: string;
}

/**
 * Obtiene una imagen de torneo desde PostgreSQL (BYTEA)
 */
export async function getTournamentImage(
  eventId: string,
  imageType: string
): Promise<TournamentImageRecord | null> {
  try {
    const result = await query(
      `SELECT * FROM tournament_images WHERE event_id = $1 AND image_type = $2`,
      [eventId, imageType]
    );

    if (result.rows.length > 0) {
      return result.rows[0] as TournamentImageRecord;
    }

    return null;
  } catch (error) {
    console.error("[DB] Error al obtener imagen de torneo:", error);
    return null;
  }
}

/**
 * Guarda una imagen de torneo en PostgreSQL (BYTEA)
 */
export async function saveTournamentImage(
  eventId: string,
  imageType: string,
  originalUrl: string,
  imageBuffer: Buffer,
  contentType: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO tournament_images (event_id, image_type, original_url, image_data, content_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id, image_type)
       DO UPDATE SET 
         original_url = EXCLUDED.original_url,
         image_data = EXCLUDED.image_data,
         content_type = EXCLUDED.content_type,
         size_bytes = EXCLUDED.size_bytes,
         downloaded_at = NOW()`,
      [eventId, imageType, originalUrl, imageBuffer, contentType, imageBuffer.length]
    );

    console.log(`[ImageCache] Guardada imagen ${eventId}/${imageType} (${imageBuffer.length} bytes)`);
  } catch (error) {
    console.error("[ImageCache] Error al guardar imagen:", error);
    throw error;
  }
}

/**
 * Descarga y cachea una imagen de torneo
 */
export async function cacheTournamentImage(
  eventId: string,
  imageType: string,
  imageUrl: string
): Promise<TournamentImageRecord | null> {
  if (!imageUrl) return null;

  try {
    // Verificar si ya está en cache
    const cached = await getTournamentImage(eventId, imageType);
    if (cached) {
      console.log(`[ImageCache] HIT ${eventId}/${imageType}`);
      return cached;
    }

    console.log(`[ImageCache] Descargando ${imageUrl}`);
    const response = await fetch(imageUrl, { timeout: 10000 } as RequestInit);

    if (!response.ok) {
      console.warn(`[ImageCache] Failed to download ${imageUrl}: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      console.warn(`[ImageCache] Empty image ${imageUrl}`);
      return null;
    }

    await saveTournamentImage(eventId, imageType, imageUrl, buffer, contentType);

    return await getTournamentImage(eventId, imageType);
  } catch (error) {
    console.error("[ImageCache] Error descargando imagen:", error);
    return null;
  }
}

/**
 * Obtiene el tamaño total del cache de imágenes
 */
export async function getImageCacheStats(): Promise<{ total_images: number; total_bytes: number }> {
  try {
    const result = await query(
      `SELECT COUNT(*) as total_images, COALESCE(SUM(size_bytes), 0) as total_bytes FROM tournament_images`
    );
    return {
      total_images: parseInt(result.rows[0].total_images, 10),
      total_bytes: parseInt(result.rows[0].total_bytes, 10),
    };
  } catch (error) {
    console.error("[DB] Error al obtener stats de imágenes:", error);
    return { total_images: 0, total_bytes: 0 };
  }
}
