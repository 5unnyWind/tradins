import { AnalysisDashboard } from "@/components/analysis-dashboard";
import { currentStorageMode, listRecords } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  noStore();
  const [records, storage] = await Promise.all([
    listRecords(100),
    Promise.resolve(currentStorageMode()),
  ]);
  return <AnalysisDashboard initialRecords={records} initialStorageMode={storage} />;
}
