import type { ShopData, ShopEntry } from "@/components/shop-view";

const OSIRION_API = "https://fnapi.osirion.gg/v1";

interface OsirionLayout {
  id?: string;
  displayName?: string;
  category?: string;
}

interface OsirionItemDetails {
  id?: string;
  name?: string;
  description?: string;
  type?: { name?: string };
  rarity?: { name?: string };
  iconUrl?: string;
  smallIconUrl?: string;
}

interface OsirionItem {
  itemDetails?: OsirionItemDetails;
}

interface OsirionPresentation {
  renderImage?: string;
}

interface OsirionPrice {
  regularPrice?: number;
  finalPrice?: number;
}

interface OsirionOffer {
  offerId: string;
  price?: OsirionPrice;
  inDate?: string;
  outDate?: string;
  giftingEnabled?: boolean;
  tileSize?: string;
  layoutId?: string;
  layout?: OsirionLayout;
  bundleId?: string;
  offerType?: string;
  offerName?: string;
  devName?: string;
  items?: OsirionItem[];
  presentations?: OsirionPresentation[];
}

interface OsirionPayload {
  success?: boolean;
  offers?: OsirionOffer[];
  error?: string;
}

function mapOffer(offer: OsirionOffer): ShopEntry {
  return {
    offerId: offer.offerId,
    regularPrice: offer.price?.regularPrice,
    finalPrice: offer.price?.finalPrice,
    inDate: offer.inDate,
    outDate: offer.outDate,
    giftable: offer.giftingEnabled,
    tileSize: offer.tileSize,
    layoutId: offer.layoutId,
    layout: offer.layout
      ? {
          id: offer.layout.id,
          name: offer.layout.displayName,
          displayType: offer.layout.category,
        }
      : undefined,
    bundle:
      offer.bundleId || offer.offerType === "Bundle"
        ? {
            name: offer.offerName || offer.devName,
          }
        : undefined,
    brItems: offer.items?.map((item) => ({
      id: item.itemDetails?.id,
      name: item.itemDetails?.name,
      description: item.itemDetails?.description,
      type: item.itemDetails?.type
        ? { displayValue: item.itemDetails.type.name }
        : undefined,
      rarity: item.itemDetails?.rarity
        ? { displayValue: item.itemDetails.rarity.name }
        : undefined,
      images: {
        icon: item.itemDetails?.iconUrl,
        featured: item.itemDetails?.smallIconUrl,
      },
    })),
    newDisplayAsset: offer.presentations?.length
      ? {
          renderImages: offer.presentations.map((p) => ({
            image: p.renderImage,
          })),
        }
      : undefined,
  };
}

function mapOsirionToShopData(payload: OsirionPayload): ShopData {
  return {
    date: payload.offers?.[0]?.inDate,
    entries: payload.offers?.map(mapOffer) ?? [],
  };
}

export async function getShopData() {
  const response = await fetch(`${OSIRION_API}/shop/item-shop?lang=en`, {
    cache: "no-store",
  });

  const payload = (await response.json()) as OsirionPayload;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "No se pudo cargar la tienda");
  }

  return mapOsirionToShopData(payload);
}
