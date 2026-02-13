import { unstable_noStore as noStore } from "next/cache";

import { SourceHealthDashboard } from "@/components/source-health-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SourceHealthPage() {
  noStore();
  return <SourceHealthDashboard />;
}
