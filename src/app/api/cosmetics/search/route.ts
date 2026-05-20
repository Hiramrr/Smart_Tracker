import { NextRequest, NextResponse } from "next/server";
import { fetchCosmeticBySearch } from "@/lib/fortnite-cosmetics";
import { ensureDatabaseInitialized } from "@/lib/init";

export async function GET(req: NextRequest) {
  await ensureDatabaseInitialized();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || undefined;
  const name = searchParams.get("name") || undefined;
  const language = searchParams.get("language") || "es-419";

  if (!id && !name) {
    return NextResponse.json(
      { success: false, error: "id o name es requerido" },
      { status: 400 }
    );
  }

  try {
    const cosmetic = await fetchCosmeticBySearch({ id, name, language });
    return NextResponse.json({ success: true, cosmetic });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error consultando cosmetico";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
