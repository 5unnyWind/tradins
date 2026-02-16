import { unstable_noStore as noStore } from "next/cache";

import { BuffMarketDashboard } from "@/components/buff-market-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function BuffCs2Page() {
  noStore();
  return <BuffMarketDashboard />;
}
