import { NextRequest, NextResponse } from "next/server";
import {
  fetchCurrentShop,
  ingestCatalog,
  ingestSingleCosmetic,
  upsertShopSnapshot,
} from "@/lib/fortnite-cosmetics";
import { ensureDatabaseInitialized } from "@/lib/init";

type IngestBody = {
  mode?: "single" | "catalog" | "shop";
  id?: string;
  name?: string;
  language?: string;
  limit?: number;
};

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(req: NextRequest) {
  await ensureDatabaseInitialized();

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "shop";
  const language = searchParams.get("language") || "es-419";

  try {
    if (mode === "single") {
      const id = searchParams.get("id") || undefined;
      const name = searchParams.get("name") || undefined;
      if (!id && !name) {
        return NextResponse.json(
          { success: false, error: "id o name es requerido para mode=single" },
          { status: 400 }
        );
      }
      const result = await ingestSingleCosmetic({ id, name, language });
      return NextResponse.json({ success: true, ...result });
    }

    if (mode === "catalog") {
      const summary = await ingestCatalog(language, parsePositiveInteger(searchParams.get("limit")));
      return NextResponse.json({ success: true, summary });
    }

    if (mode === "shop") {
      const shop = await fetchCurrentShop(language);
      const summary = await upsertShopSnapshot(shop);
      return NextResponse.json({ success: true, summary });
    }

    return NextResponse.json(
      { success: false, error: "mode debe ser single, catalog o shop" },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error ingiriendo cosmeticos";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await ensureDatabaseInitialized();

  try {
    const body = await req.json() as IngestBody;
    const mode = body.mode || "shop";
    const language = body.language || "es-419";

    if (mode === "single") {
      if (!body.id && !body.name) {
        return NextResponse.json(
          { success: false, error: "id o name es requerido para mode=single" },
          { status: 400 }
        );
      }
      const result = await ingestSingleCosmetic({ id: body.id, name: body.name, language });
      return NextResponse.json({ success: true, ...result });
    }

    if (mode === "catalog") {
      const summary = await ingestCatalog(language, body.limit);
      return NextResponse.json({ success: true, summary });
    }

    const shop = await fetchCurrentShop(language);
    const summary = await upsertShopSnapshot(shop);
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error ingiriendo cosmeticos";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
