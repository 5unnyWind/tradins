import { resolveFinalRecommendation } from "@/lib/engine";
import type {
  AnalysisInput,
  AnalysisRecordMeta,
  AnalysisResult,
  BacktestSignal,
  ConclusionDriftPoint,
  RecommendationCalibration,
} from "@/lib/types";
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
  const recommendation = resolveFinalRecommendation(result);
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

export async function listRecords(limit = 20, cursor: number | null = null): Promise<AnalysisRecordMeta[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const safeCursor = Number.isInteger(cursor) && (cursor as number) > 0 ? (cursor as number) : null;

  if (!hasVercelPostgres) {
    const records = await readLocalStore();
    const filtered = safeCursor ? records.filter((row) => row.meta.id < safeCursor) : records;
    return filtered.map((r) => r.meta).slice(0, safeLimit);
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

  const fetchBatch = async (take: number, beforeId: number | null): Promise<DbRecordRow[]> => {
    const rows = beforeId
      ? ((await sql`
          SELECT id, symbol, analysis_mode, debate_rounds, recommendation, created_at
          FROM analysis_records
          WHERE id < ${beforeId}
          ORDER BY id DESC
          LIMIT ${take}
        `) as { rows: DbRecordRow[] })
      : ((await sql`
          SELECT id, symbol, analysis_mode, debate_rounds, recommendation, created_at
          FROM analysis_records
          ORDER BY id DESC
          LIMIT ${take}
        `) as { rows: DbRecordRow[] });
    return rows.rows;
  }

  const seen = new Set<number>();
  const collected: AnalysisRecordMeta[] = [];
  const pageSize = Math.min(50, safeLimit);
  let beforeId: number | null = safeCursor;
  let stagnantRounds = 0;

  // Keyset pagination avoids large OFFSET scans and recovers from occasional partial pages.
  for (let round = 0; round < 20 && collected.length < safeLimit; round += 1) {
    const take = Math.min(pageSize, safeLimit - collected.length);
    const page = await fetchBatch(take, beforeId);
    if (!page.length) break;

    let added = 0;
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      collected.push(mapMeta(row));
      added += 1;
      if (collected.length >= safeLimit) break;
    }

    const pageLastId = page[page.length - 1]?.id;
    if (!Number.isInteger(pageLastId) || (beforeId !== null && pageLastId >= beforeId)) break;
    beforeId = pageLastId;

    if (added === 0) {
      stagnantRounds += 1;
      if (stagnantRounds >= 2) break;
    } else {
      stagnantRounds = 0;
    }
  }

  return collected.slice(0, safeLimit);
}

export async function listBacktestSignals(
  symbol: string,
  fromIso: string,
  limit = 2000,
): Promise<BacktestSignal[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const fromDate = new Date(fromIso);
  if (!normalizedSymbol || !Number.isFinite(fromDate.getTime())) return [];

  const safeLimit = Math.max(10, Math.min(5000, Math.floor(limit)));
  const allowed = new Set(["买入", "观望", "减仓", "卖出"]);

  if (!hasVercelPostgres) {
    const records = await readLocalStore();
    return records
      .map((item) => item.meta)
      .filter((meta) =>
        meta.symbol.trim().toUpperCase() === normalizedSymbol &&
        new Date(meta.createdAt).getTime() >= fromDate.getTime() &&
        (meta.recommendation === null || allowed.has(meta.recommendation))
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, safeLimit)
      .map((meta) => ({
        id: meta.id,
        symbol: meta.symbol,
        recommendation: meta.recommendation as BacktestSignal["recommendation"],
        createdAt: meta.createdAt,
      }));
  }

  await ensureTable();
  const sql = await getSqlTag();
  const rows = (await sql`
    SELECT id, symbol, recommendation, created_at
    FROM analysis_records
    WHERE UPPER(symbol) = ${normalizedSymbol}
      AND created_at >= ${fromDate.toISOString()}
    ORDER BY created_at ASC, id ASC
    LIMIT ${safeLimit}
  `) as {
    rows: Array<{
      id: number;
      symbol: string;
      recommendation: string | null;
      created_at: string;
    }>;
  };

  return rows.rows
    .filter((row) => row.recommendation === null || allowed.has(row.recommendation))
    .map((row) => ({
      id: row.id,
      symbol: row.symbol,
      recommendation: row.recommendation as BacktestSignal["recommendation"],
      createdAt: new Date(row.created_at).toISOString(),
    }));
}

function normalizeRecommendation(
  value: unknown,
): ConclusionDriftPoint["recommendation"] {
  if (value === "买入" || value === "观望" || value === "减仓" || value === "卖出") {
    return value;
  }
  return null;
}

function normalizeConfidenceLevel(
  value: unknown,
): RecommendationCalibration["confidenceLevel"] | null {
  if (value === "high" || value === "medium" || value === "low") return value;
  return null;
}

function toAnalysisResult(raw: unknown): AnalysisResult | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as AnalysisResult;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as AnalysisResult;
  return null;
}

export async function listConclusionDriftPoints(
  symbol: string,
  limit = 60,
): Promise<ConclusionDriftPoint[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return [];
  const safeLimit = Math.max(5, Math.min(300, Math.floor(limit)));

  if (!hasVercelPostgres) {
    const records = await readLocalStore();
    return records
      .filter((item) => item.meta.symbol.trim().toUpperCase() === normalizedSymbol)
      .sort((left, right) => right.meta.id - left.meta.id)
      .slice(0, safeLimit)
      .map((item) => {
        const calibration = item.result?.recommendationCalibration;
        const confidence = Number(calibration?.confidence);
        return {
          id: item.meta.id,
          symbol: item.meta.symbol,
          recommendation: normalizeRecommendation(item.meta.recommendation ?? calibration?.finalRecommendation),
          confidence: Number.isFinite(confidence) ? confidence : null,
          confidenceLevel: normalizeConfidenceLevel(calibration?.confidenceLevel),
          createdAt: item.meta.createdAt,
        } satisfies ConclusionDriftPoint;
      })
      .sort((left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.id - right.id
      );
  }

  await ensureTable();
  const sql = await getSqlTag();
  const rows = (await sql`
    SELECT id, symbol, recommendation, created_at, result
    FROM analysis_records
    WHERE UPPER(symbol) = ${normalizedSymbol}
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `) as {
    rows: Array<{
      id: number;
      symbol: string;
      recommendation: string | null;
      created_at: string;
      result: unknown;
    }>;
  };

  return rows.rows
    .map((row) => {
      const result = toAnalysisResult(row.result);
      const calibration = result?.recommendationCalibration;
      const confidence = Number(calibration?.confidence);
      return {
        id: row.id,
        symbol: row.symbol,
        recommendation: normalizeRecommendation(row.recommendation ?? calibration?.finalRecommendation),
        confidence: Number.isFinite(confidence) ? confidence : null,
        confidenceLevel: normalizeConfidenceLevel(calibration?.confidenceLevel),
        createdAt: new Date(row.created_at).toISOString(),
      } satisfies ConclusionDriftPoint;
    })
    .sort((left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.id - right.id
    );
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
