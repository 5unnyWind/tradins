import { unstable_noStore as noStore } from "next/cache";

import { SchedulerDashboard } from "@/components/scheduler-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SchedulerPage() {
  noStore();
  return <SchedulerDashboard />;
}
