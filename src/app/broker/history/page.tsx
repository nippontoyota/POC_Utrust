import {
  Marketplace,
  type MarketParams,
} from "@/components/broker/Marketplace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<MarketParams>;
}) {
  return <Marketplace view="history" params={await searchParams} />;
}
