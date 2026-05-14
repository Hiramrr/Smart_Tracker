import type { ShopData } from "@/components/shop-view";

const FORTNITE_API_BASE = "https://fortnite-api.com/v2";

export async function getShopData() {
  if (!process.env.FORTNITE_API_KEY) {
    throw new Error("FORTNITE_API_KEY no configurada");
  }

  const response = await fetch(`${FORTNITE_API_BASE}/shop?language=es-419`, {
    cache: "no-store",
    headers: {
      Authorization: process.env.FORTNITE_API_KEY,
    },
  });
  const payload = (await response.json()) as { data?: ShopData; error?: string };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error || "No se pudo cargar la tienda");
  }

  return payload.data;
}
