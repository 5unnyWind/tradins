import { extractRecommendation } from "@/lib/engine";
import type { AnalysisInput, AnalysisRecordMeta, AnalysisResult } from "@/lib/types";
import { promises as fs } from "node:fs";
import path from "node:path";

const hasVercelPostgres = Boolean(
  process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL,
);

let ensuredTable: Promise<void> | null = null;
const localStoreFile = path.join(process.cwd(), ".tradins-local-records.json");

type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<{ rows: Array<Record<string, unknown>> }>;

let sqlTag: SqlTag | null = null;

async function getSqlTag(): Promise<SqlTag> {
  if (!sqlTag) {
    const mod = await import("@vercel/postgres");
    sqlTag = mod.sql as unknown as SqlTag;
  }
  return sqlTag;
}

async function ensureTable(): Promise<void> {
  if (!hasVercelPostgres) return;
  if (!ensuredTable) {
    ensuredTable = (async () => {
      const sql = await getSqlTag();
      await sql`
        CREATE TABLE IF NOT EXISTS analysis_records (
          id SERIAL PRIMARY KEY,
          symbol TEXT NOT NULL,
          analysis_mode TEXT NOT NULL,
          debate_rounds INTEGER NOT NULL,
          recommendation TEXT,
          result JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })();
  }
  await ensuredTable;
}

type LocalRecord = { meta: AnalysisRecordMeta; result: AnalysisResult };

async function readLocalStore(): Promise<LocalRecord[]> {
  try {
    const raw = await fs.readFile(localStoreFile, "utf-8");
    const parsed = JSON.parse(raw) as LocalRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalStore(records: LocalRecord[]): Promise<void> {
  await fs.writeFile(localStoreFile, JSON.stringify(records, null, 2), "utf-8");
}

export async function saveRecord(
  input: AnalysisInput,
  result: AnalysisResult,
): Promise<{ id: number; storage: "vercel_postgres" | "memory" }> {
  const recommendation = extractRecommendation(result.riskReports.judge);
  if (!hasVercelPostgres) {
    const records = await readLocalStore();
    const id = (records[0]?.meta.id ?? 0) + 1;
    const meta: AnalysisRecordMeta = {
      id,
      symbol: input.symbol,
      analysisMode: input.analysisMode,
      debateRounds: input.debateRounds,
      recommendation,
      createdAt: new Date().toISOString(),
    };
    records.unshift({ meta, result });
    await writeLocalStore(records.slice(0, 200));
    return { id, storage: "memory" };
  }

  await ensureTable();
  const sql = await getSqlTag();
  const inserted = (await sql`
    INSERT INTO analysis_records (symbol, analysis_mode, debate_rounds, recommendation, result)
    VALUES (${input.symbol}, ${input.analysisMode}, ${input.debateRounds}, ${recommendation}, ${JSON.stringify(result)})
    RETURNING id
  `) as { rows: Array<{ id: number }> };
  return { id: inserted.rows[0]?.id ?? 0, storage: "vercel_postgres" };
}

export async function listRecords(limit = 20): Promise<AnalysisRecordMeta[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));

  if (!hasVercelPostgres) {
    const records = await readLocalStore();
    return records.map((r) => r.meta).slice(0, safeLimit);
  }

  await ensureTable();
  const sql = await getSqlTag();
  type DbRecordRow = {
    id: number;
    symbol: string;
    analysis_mode: string;
    debate_rounds: number;
    recommendation: string | null;
    created_at: string;
  };

  const mapMeta = (row: DbRecordRow): AnalysisRecordMeta => ({
    id: row.id,
    symbol: row.symbol,
    analysisMode: row.analysis_mode as AnalysisRecordMeta["analysisMode"],
    debateRounds: row.debate_rounds,
    recommendation: row.recommendation,
    createdAt: new Date(row.created_at).toISOString(),
  });

  const fetchBatch = async (take: number, skip: number): Promise<DbRecordRow[]> => {
    const rows = (await sql`
      SELECT id, symbol, analysis_mode, debate_rounds, recommendation, created_at
      FROM analysis_records
      ORDER BY id DESC
      LIMIT ${take}
      OFFSET ${skip}
    `) as { rows: DbRecordRow[] };
    return rows.rows;
  };

  // Single bulk query for the common path.
  const firstBatch = await fetchBatch(Math.min(200, safeLimit), 0);
  if (firstBatch.length >= safeLimit) {
    return firstBatch.slice(0, safeLimit).map(mapMeta);
  }

  // Some Vercel Postgres / Neon environments occasionally truncate multi-row scans.
  // Page through with OFFSET and dedupe by id to reconstruct a stable result set.
  const seen = new Set<number>();
  const collected: AnalysisRecordMeta[] = [];
  for (const row of firstBatch) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    collected.push(mapMeta(row));
  }

  const pageSize = Math.min(50, safeLimit);
  let offset = firstBatch.length;
  let stagnantRounds = 0;

  for (let round = 0; round < 12 && collected.length < safeLimit; round += 1) {
    const page = await fetchBatch(pageSize, offset);
    if (!page.length) break;

    let added = 0;
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      collected.push(mapMeta(row));
      added += 1;
      if (collected.length >= safeLimit) break;
    }

    offset += page.length;
    if (page.length < pageSize) break;

    if (added === 0) {
      stagnantRounds += 1;
      if (stagnantRounds >= 2) break;
    } else {
      stagnantRounds = 0;
    }
  }

  return collected.slice(0, safeLimit);
}

export async function getRecord(
  id: number,
): Promise<(AnalysisRecordMeta & { result: AnalysisResult }) | null> {
  if (!hasVercelPostgres) {
    const records = await readLocalStore();
    const row = records.find((item) => item.meta.id === id);
    return row ? { ...row.meta, result: row.result } : null;
  }

  await ensureTable();
  const sql = await getSqlTag();
  const rows = (await sql`
    SELECT id, symbol, analysis_mode, debate_rounds, recommendation, created_at, result
    FROM analysis_records
    WHERE id = ${id}
    LIMIT 1
  `) as {
    rows: Array<{
      id: number;
      symbol: string;
      analysis_mode: string;
      debate_rounds: number;
      recommendation: string | null;
      created_at: string;
      result: AnalysisResult;
    }>;
  };

  const row = rows.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    analysisMode: row.analysis_mode as AnalysisRecordMeta["analysisMode"],
    debateRounds: row.debate_rounds,
    recommendation: row.recommendation,
    createdAt: new Date(row.created_at).toISOString(),
    result: row.result,
  };
}

export function currentStorageMode(): "vercel_postgres" | "memory" {
  return hasVercelPostgres ? "vercel_postgres" : "memory";
}
