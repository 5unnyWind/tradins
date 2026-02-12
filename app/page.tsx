import { AnalysisDashboard } from "@/components/analysis-dashboard";
import { currentStorageMode, listRecords } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [records, storage] = await Promise.all([
    listRecords(30),
    Promise.resolve(currentStorageMode()),
  ]);
  return <AnalysisDashboard initialRecords={records} initialStorageMode={storage} />;
}
