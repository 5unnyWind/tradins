import { AnalysisDashboard } from "@/components/analysis-dashboard";
import { currentStorageMode, listRecords } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  noStore();
  const [recordBatch, storage] = await Promise.all([
    listRecords(11),
    Promise.resolve(currentStorageMode()),
  ]);
  const initialRecords = recordBatch.slice(0, 10);
  const initialHasMore = recordBatch.length > 10;
  return (
    <AnalysisDashboard
      initialRecords={initialRecords}
      initialStorageMode={storage}
      initialHasMore={initialHasMore}
    />
  );
}
