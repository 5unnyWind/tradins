import { unstable_noStore as noStore } from "next/cache";

import { BacktestDashboard } from "@/components/backtest-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function BacktestPage() {
  noStore();
  return <BacktestDashboard />;
}
