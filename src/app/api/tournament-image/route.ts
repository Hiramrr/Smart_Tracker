import { NextRequest, NextResponse } from "next/server";

const VALID_IMAGE_TYPES = ["poster", "square", "background", "playlist"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const imageType = searchParams.get("type");
  const originalUrl = searchParams.get("url");

  if (!eventId || !imageType || !VALID_IMAGE_TYPES.includes(imageType)) {
    return NextResponse.json(
      { success: false, error: "eventId y type validos son requeridos" },
      { status: 400 }
    );
  }

  if (!originalUrl) {
    return NextResponse.json(
      { success: false, error: "url de imagen requerida" },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(originalUrl, {
      headers: {
        "User-Agent": "FN.STATS/1.0",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      next: { revalidate: 86400 },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: `No se pudo cargar la imagen (${upstream.status})` },
        { status: upstream.status }
      );
    }

    const imageBuffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type") || "image/jpeg";

    return new NextResponse(imageBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Length": String(imageBuffer.length),
      },
    });
  } catch (error) {
    console.error("[TournamentImage] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno al servir imagen" },
      { status: 500 }
    );
  }
}
