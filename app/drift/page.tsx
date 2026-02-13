import { unstable_noStore as noStore } from "next/cache";

import { DriftDashboard } from "@/components/drift-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DriftPage() {
  noStore();
  return <DriftDashboard />;
}
