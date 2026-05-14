import { ShopView } from "@/components/shop-view";
import { getShopData } from "@/lib/shop";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const shop = await getShopData();

  return <ShopView shop={shop} />;
}
