import { initializeDatabase } from "./db-init";

let initPromise: Promise<void> | null = null;

export async function ensureDatabaseInitialized(): Promise<void> {
  if (initPromise) return initPromise;
  
  initPromise = initializeDatabase().catch((error) => {
    console.error("[Init] Falló la inicialización de la base de datos:", error);
    initPromise = null;
    throw error;
  });

  return initPromise;
}
