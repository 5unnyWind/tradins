import type {
  DataSourceHealthItem,
  DataSourceHealthSeries,
  DataSourceHealthSeriesPoint,
  DataSourceHealthSnapshot,
  DataSourceKey,
} from "@/lib/types";
import { promises as fs } from "node:fs";
import path from "node:path";

const SOURCE_KEYS: DataSourceKey[] = ["yahoo", "eastmoney", "reddit", "steam", "hltv", "liquipedia"];
const LATENCY_WINDOW = 240;
const SERIES_WINDOW_MINUTES = 360;
const SERIES_BUCKET_MINUTES = 5;
const SERIES_BUCKET_MS = SERIES_BUCKET_MINUTES * 60_000;
const LOCAL_EVENT_LIMIT = 20_000;
const hasVercelPostgres = Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL);
const localStoreFile = path.join(process.cwd(), ".tradins-local-source-health.json");

type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<{ rows: Array<Record<string, unknown>> }>;

type SourceHealthState = {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalLatencyMs: number;
  latenciesMs: number[];
  lastStatus: "success" | "failed" | "idle";
  lastError: string | null;
  lastLatencyMs: number | null;
  lastAt: string | null;
};

type PersistedSourceHealthEvent = {
  source: DataSourceKey;
  status: "success" | "failed";
  latencyMs: number;
  error: string | null;
  at: string;
};

type SummaryRow = {
  source: string;
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  avg_latency_ms: number | string | null;
};

type LastRow = {
  source: string;
  status: string;
  error: string | null;
  latency_ms: number | null;
  created_at: string;
};

type P95Row = {
  source: string;
  p95_latency_ms: number | string | null;
};

type TimelineRow = {
  source: string;
  bucket_at: string;
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  avg_latency_ms: number | string | null;
  p95_latency_ms: number | string | null;
};

const sourceHealthState: Record<DataSourceKey, SourceHealthState> = {
  yahoo: createEmptyState(),
  eastmoney: createEmptyState(),
  reddit: createEmptyState(),
  steam: createEmptyState(),
  hltv: createEmptyState(),
  liquipedia: createEmptyState(),
};

let sqlTag: SqlTag | null = null;
let ensuredEventsTable: Promise<void> | null = null;
let localEventsCache: PersistedSourceHealthEvent[] | null = null;
let localWriteQueue: Promise<void> = Promise.resolve();

function createEmptyState(): SourceHealthState {
  return {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    totalLatencyMs: 0,
    latenciesMs: [],
    lastStatus: "idle",
    lastError: null,
    lastLatencyMs: null,
    lastAt: null,
  };
}

function clampLatency(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function pushLatency(state: SourceHealthState, latencyMs: number): void {
  state.latenciesMs.push(latencyMs);
  if (state.latenciesMs.length > LATENCY_WINDOW) {
    state.latenciesMs.splice(0, state.latenciesMs.length - LATENCY_WINDOW);
  }
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? null;
}

function toRatePct(value: number, total: number): number | null {
  if (!total) return null;
  return Number(((value / total) * 100).toFixed(2));
}

function toAvgLatency(totalLatencyMs: number, totalRequests: number): number | null {
  if (!totalRequests) return null;
  return Number((totalLatencyMs / totalRequests).toFixed(2));
}

function toP95Latency(latenciesMs: number[]): number | null {
  const p95 = percentile(latenciesMs, 0.95);
  if (p95 === null) return null;
  return Number(p95.toFixed(2));
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isDataSourceKey(value: string): value is DataSourceKey {
  return SOURCE_KEYS.includes(value as DataSourceKey);
}

function parsePersistedEvent(raw: unknown): PersistedSourceHealthEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const source = String(row.source ?? "");
  const status = String(row.status ?? "");
  if (!isDataSourceKey(source)) return null;
  if (status !== "success" && status !== "failed") return null;
  const latency = clampLatency(Number(row.latencyMs));
  const atRaw = String(row.at ?? "");
  const atMs = Date.parse(atRaw);
  if (!Number.isFinite(atMs)) return null;
  const error = row.error === null || row.error === undefined ? null : String(row.error);
  return {
    source,
    status,
    latencyMs: latency,
    error,
    at: new Date(atMs).toISOString(),
  };
}

async function getSqlTag(): Promise<SqlTag> {
  if (!sqlTag) {
    const mod = await import("@vercel/postgres");
    sqlTag = mod.sql as unknown as SqlTag;
  }
  return sqlTag;
}

async function ensureEventsTable(): Promise<void> {
  if (!hasVercelPostgres) return;
  if (!ensuredEventsTable) {
    ensuredEventsTable = (async () => {
      const sql = await getSqlTag();
      await sql`
        CREATE TABLE IF NOT EXISTS source_health_events (
          id SERIAL PRIMARY KEY,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          latency_ms INTEGER NOT NULL,
          error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_source_health_events_source_time
        ON source_health_events (source, created_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_source_health_events_time
        ON source_health_events (created_at DESC)
      `;
    })();
  }
  await ensuredEventsTable;
}

async function readLocalEvents(): Promise<PersistedSourceHealthEvent[]> {
  if (localEventsCache) return localEventsCache;
  try {
    const raw = await fs.readFile(localStoreFile, "utf-8");
    const parsed = JSON.parse(raw) as unknown[];
    const events = Array.isArray(parsed)
      ? parsed
          .map((item) => parsePersistedEvent(item))
          .filter((item): item is PersistedSourceHealthEvent => item !== null)
      : [];
    localEventsCache = events;
    return events;
  } catch {
    localEventsCache = [];
    return [];
  }
}

async function writeLocalEvents(events: PersistedSourceHealthEvent[]): Promise<void> {
  localEventsCache = events;
  await fs.writeFile(localStoreFile, JSON.stringify(events, null, 2), "utf-8");
}

function enqueueLocalWrite(
  updater: (events: PersistedSourceHealthEvent[]) => PersistedSourceHealthEvent[],
): Promise<void> {
  localWriteQueue = localWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const current = await readLocalEvents();
      const updated = updater(current);
      await writeLocalEvents(updated);
    });
  return localWriteQueue;
}

async function clearLocalEvents(): Promise<void> {
  localWriteQueue = localWriteQueue
    .catch(() => undefined)
    .then(async () => {
      localEventsCache = [];
      try {
        await fs.unlink(localStoreFile);
      } catch {
        await writeLocalEvents([]);
      }
    });
  await localWriteQueue;
}

async function persistSourceHealthEvent(event: PersistedSourceHealthEvent): Promise<void> {
  if (!hasVercelPostgres) {
    await enqueueLocalWrite((events) => {
      const next = [...events, event];
      if (next.length > LOCAL_EVENT_LIMIT) {
        next.splice(0, next.length - LOCAL_EVENT_LIMIT);
      }
      return next;
    });
    return;
  }
  await ensureEventsTable();
  const sql = await getSqlTag();
  await sql`
    INSERT INTO source_health_events (source, status, latency_ms, error, created_at)
    VALUES (${event.source}, ${event.status}, ${event.latencyMs}, ${event.error}, ${event.at})
  `;
}

function mapMemoryItem(source: DataSourceKey): DataSourceHealthItem {
  const state = sourceHealthState[source];
  return {
    source,
    totalRequests: state.totalRequests,
    successRequests: state.successRequests,
    failedRequests: state.failedRequests,
    hitRatePct: toRatePct(state.successRequests, state.totalRequests),
    failureRatePct: toRatePct(state.failedRequests, state.totalRequests),
    avgLatencyMs: toAvgLatency(state.totalLatencyMs, state.totalRequests),
    p95LatencyMs: toP95Latency(state.latenciesMs),
    lastStatus: state.lastStatus,
    lastError: state.lastError,
    lastLatencyMs: state.lastLatencyMs,
    lastAt: state.lastAt,
  };
}

function createSeriesPoint(args: {
  at: string;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
}): DataSourceHealthSeriesPoint {
  return {
    at: args.at,
    requests: args.totalRequests,
    hitRatePct: toRatePct(args.successRequests, args.totalRequests),
    failureRatePct: toRatePct(args.failedRequests, args.totalRequests),
    avgLatencyMs: args.avgLatencyMs === null ? null : Number(args.avgLatencyMs.toFixed(2)),
    p95LatencyMs: args.p95LatencyMs === null ? null : Number(args.p95LatencyMs.toFixed(2)),
  };
}

function createEmptySeries(source: DataSourceKey): DataSourceHealthSeries {
  return { source, points: [] };
}

function getMemorySnapshot(): DataSourceHealthSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    latencyWindowSize: LATENCY_WINDOW,
    seriesWindowMinutes: SERIES_WINDOW_MINUTES,
    seriesBucketMinutes: SERIES_BUCKET_MINUTES,
    sources: SOURCE_KEYS.map(mapMemoryItem),
    series: SOURCE_KEYS.map(createEmptySeries),
  };
}

type EventAggregate = {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalLatencyMs: number;
  recentLatenciesMs: number[];
  lastStatus: "success" | "failed" | "idle";
  lastError: string | null;
  lastLatencyMs: number | null;
  lastAt: string | null;
};

function createEventAggregate(): EventAggregate {
  return {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    totalLatencyMs: 0,
    recentLatenciesMs: [],
    lastStatus: "idle",
    lastError: null,
    lastLatencyMs: null,
    lastAt: null,
  };
}

function buildSnapshotFromEvents(events: PersistedSourceHealthEvent[]): DataSourceHealthSnapshot {
  const aggregates = new Map<DataSourceKey, EventAggregate>();
  const seriesBuckets = new Map<DataSourceKey, Map<number, { total: number; success: number; failed: number; latencies: number[] }>>();
  const nowMs = Date.now();
  const sinceMs = nowMs - SERIES_WINDOW_MINUTES * 60_000;

  for (const source of SOURCE_KEYS) {
    aggregates.set(source, createEventAggregate());
    seriesBuckets.set(source, new Map());
  }

  const sortedEvents = [...events]
    .filter((event) => isDataSourceKey(event.source))
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));

  for (const event of sortedEvents) {
    const aggregate = aggregates.get(event.source);
    if (!aggregate) continue;

    aggregate.totalRequests += 1;
    aggregate.totalLatencyMs += event.latencyMs;
    if (event.status === "success") {
      aggregate.successRequests += 1;
      aggregate.lastError = null;
    } else {
      aggregate.failedRequests += 1;
      aggregate.lastError = event.error ?? "unknown error";
    }
    aggregate.recentLatenciesMs.push(event.latencyMs);
    if (aggregate.recentLatenciesMs.length > LATENCY_WINDOW) {
      aggregate.recentLatenciesMs.splice(0, aggregate.recentLatenciesMs.length - LATENCY_WINDOW);
    }
    aggregate.lastStatus = event.status;
    aggregate.lastLatencyMs = event.latencyMs;
    aggregate.lastAt = event.at;

    const eventMs = Date.parse(event.at);
    if (!Number.isFinite(eventMs) || eventMs < sinceMs) continue;
    const bucketKey = Math.floor(eventMs / SERIES_BUCKET_MS) * SERIES_BUCKET_MS;
    const sourceBuckets = seriesBuckets.get(event.source);
    if (!sourceBuckets) continue;
    const bucket = sourceBuckets.get(bucketKey) ?? { total: 0, success: 0, failed: 0, latencies: [] };
    bucket.total += 1;
    if (event.status === "success") {
      bucket.success += 1;
    } else {
      bucket.failed += 1;
    }
    bucket.latencies.push(event.latencyMs);
    sourceBuckets.set(bucketKey, bucket);
  }

  const sources: DataSourceHealthItem[] = SOURCE_KEYS.map((source) => {
    const aggregate = aggregates.get(source) ?? createEventAggregate();
    return {
      source,
      totalRequests: aggregate.totalRequests,
      successRequests: aggregate.successRequests,
      failedRequests: aggregate.failedRequests,
      hitRatePct: toRatePct(aggregate.successRequests, aggregate.totalRequests),
      failureRatePct: toRatePct(aggregate.failedRequests, aggregate.totalRequests),
      avgLatencyMs: toAvgLatency(aggregate.totalLatencyMs, aggregate.totalRequests),
      p95LatencyMs: toP95Latency(aggregate.recentLatenciesMs),
      lastStatus: aggregate.lastStatus,
      lastError: aggregate.lastError,
      lastLatencyMs: aggregate.lastLatencyMs,
      lastAt: aggregate.lastAt,
    };
  });

  const series: DataSourceHealthSeries[] = SOURCE_KEYS.map((source) => {
    const sourceBuckets =
      seriesBuckets.get(source) ??
      new Map<number, { total: number; success: number; failed: number; latencies: number[] }>();
    const points = [...sourceBuckets.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([bucketKey, bucket]) =>
        createSeriesPoint({
          at: new Date(bucketKey).toISOString(),
          totalRequests: bucket.total,
          successRequests: bucket.success,
          failedRequests: bucket.failed,
          avgLatencyMs: bucket.total
            ? bucket.latencies.reduce((sum: number, value: number) => sum + value, 0) / bucket.total
            : null,
          p95LatencyMs: toP95Latency(bucket.latencies),
        }),
      );
    return { source, points };
  });

  return {
    generatedAt: new Date().toISOString(),
    latencyWindowSize: LATENCY_WINDOW,
    seriesWindowMinutes: SERIES_WINDOW_MINUTES,
    seriesBucketMinutes: SERIES_BUCKET_MINUTES,
    sources,
    series,
  };
}

async function buildSnapshotFromPostgres(): Promise<DataSourceHealthSnapshot> {
  await ensureEventsTable();
  const sql = await getSqlTag();
  const timelineSinceIso = new Date(Date.now() - SERIES_WINDOW_MINUTES * 60_000).toISOString();
  const bucketSeconds = SERIES_BUCKET_MINUTES * 60;

  const [summaryRows, lastRows, p95Rows, timelineRows] = await Promise.all([
    (await sql`
      SELECT
        source,
        COUNT(*)::int AS total_requests,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success_requests,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_requests,
        AVG(latency_ms) AS avg_latency_ms
      FROM source_health_events
      GROUP BY source
    `) as { rows: SummaryRow[] },
    (await sql`
      SELECT DISTINCT ON (source)
        source,
        status,
        error,
        latency_ms,
        created_at
      FROM source_health_events
      ORDER BY source, created_at DESC, id DESC
    `) as { rows: LastRow[] },
    (await sql`
      WITH ranked AS (
        SELECT
          source,
          latency_ms,
          ROW_NUMBER() OVER (PARTITION BY source ORDER BY created_at DESC, id DESC) AS rn
        FROM source_health_events
      )
      SELECT
        source,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms
      FROM ranked
      WHERE rn <= ${LATENCY_WINDOW}
      GROUP BY source
    `) as { rows: P95Row[] },
    (await sql`
      SELECT
        source,
        to_timestamp(
          floor(extract(epoch FROM created_at) / ${bucketSeconds}) * ${bucketSeconds}
        ) AS bucket_at,
        COUNT(*)::int AS total_requests,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success_requests,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_requests,
        AVG(latency_ms) AS avg_latency_ms,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms
      FROM source_health_events
      WHERE created_at >= ${timelineSinceIso}
      GROUP BY source, bucket_at
      ORDER BY bucket_at ASC
    `) as { rows: TimelineRow[] },
  ]);

  const summaryMap = new Map<DataSourceKey, SummaryRow>();
  const lastMap = new Map<DataSourceKey, LastRow>();
  const p95Map = new Map<DataSourceKey, P95Row>();
  const seriesMap = new Map<DataSourceKey, DataSourceHealthSeriesPoint[]>();
  for (const source of SOURCE_KEYS) {
    seriesMap.set(source, []);
  }

  for (const row of summaryRows.rows) {
    if (!isDataSourceKey(row.source)) continue;
    summaryMap.set(row.source, row);
  }
  for (const row of lastRows.rows) {
    if (!isDataSourceKey(row.source)) continue;
    lastMap.set(row.source, row);
  }
  for (const row of p95Rows.rows) {
    if (!isDataSourceKey(row.source)) continue;
    p95Map.set(row.source, row);
  }
  for (const row of timelineRows.rows) {
    if (!isDataSourceKey(row.source)) continue;
    const points = seriesMap.get(row.source);
    if (!points) continue;
    const at = new Date(row.bucket_at).toISOString();
    points.push(
      createSeriesPoint({
        at,
        totalRequests: Number(row.total_requests) || 0,
        successRequests: Number(row.success_requests) || 0,
        failedRequests: Number(row.failed_requests) || 0,
        avgLatencyMs: toNumberOrNull(row.avg_latency_ms),
        p95LatencyMs: toNumberOrNull(row.p95_latency_ms),
      }),
    );
  }

  const sources: DataSourceHealthItem[] = SOURCE_KEYS.map((source) => {
    const summary = summaryMap.get(source);
    const last = lastMap.get(source);
    const p95 = p95Map.get(source);
    const totalRequests = Number(summary?.total_requests ?? 0) || 0;
    const successRequests = Number(summary?.success_requests ?? 0) || 0;
    const failedRequests = Number(summary?.failed_requests ?? 0) || 0;
    const lastStatus =
      last?.status === "success" || last?.status === "failed" ? (last.status as "success" | "failed") : "idle";
    return {
      source,
      totalRequests,
      successRequests,
      failedRequests,
      hitRatePct: toRatePct(successRequests, totalRequests),
      failureRatePct: toRatePct(failedRequests, totalRequests),
      avgLatencyMs: toNumberOrNull(summary?.avg_latency_ms),
      p95LatencyMs: toNumberOrNull(p95?.p95_latency_ms),
      lastStatus,
      lastError: lastStatus === "failed" ? last?.error ?? "unknown error" : null,
      lastLatencyMs: toNumberOrNull(last?.latency_ms),
      lastAt: last?.created_at ? new Date(last.created_at).toISOString() : null,
    };
  });

  const series: DataSourceHealthSeries[] = SOURCE_KEYS.map((source) => ({
    source,
    points: seriesMap.get(source) ?? [],
  }));

  return {
    generatedAt: new Date().toISOString(),
    latencyWindowSize: LATENCY_WINDOW,
    seriesWindowMinutes: SERIES_WINDOW_MINUTES,
    seriesBucketMinutes: SERIES_BUCKET_MINUTES,
    sources,
    series,
  };
}

async function buildSnapshotFromLocalStore(): Promise<DataSourceHealthSnapshot> {
  await localWriteQueue.catch(() => undefined);
  const events = await readLocalEvents();
  return buildSnapshotFromEvents(events);
}

export function recordSourceHealth(
  source: DataSourceKey,
  status: "success" | "failed",
  latencyMs: number,
  error?: unknown,
): void {
  const state = sourceHealthState[source];
  if (!state) return;

  const latency = clampLatency(latencyMs);
  const normalizedError = status === "failed" ? (error ? normalizeError(error) : "unknown error") : null;
  const nowIso = new Date().toISOString();

  state.totalRequests += 1;
  state.totalLatencyMs += latency;
  pushLatency(state, latency);
  state.lastStatus = status;
  state.lastLatencyMs = latency;
  state.lastAt = nowIso;

  if (status === "success") {
    state.successRequests += 1;
    state.lastError = null;
  } else {
    state.failedRequests += 1;
    state.lastError = normalizedError;
  }

  const event: PersistedSourceHealthEvent = {
    source,
    status,
    latencyMs: latency,
    error: normalizedError,
    at: nowIso,
  };
  void persistSourceHealthEvent(event).catch((persistError) => {
    console.warn(`[source-health] persist failed: ${normalizeError(persistError)}`);
  });
}

export async function getSourceHealthSnapshot(): Promise<DataSourceHealthSnapshot> {
  if (hasVercelPostgres) {
    try {
      return await buildSnapshotFromPostgres();
    } catch (error) {
      console.warn(`[source-health] snapshot query failed, fallback to memory: ${normalizeError(error)}`);
      return getMemorySnapshot();
    }
  }

  try {
    const snapshot = await buildSnapshotFromLocalStore();
    const hasPersistedData =
      snapshot.sources.some((item) => item.totalRequests > 0) ||
      snapshot.series.some((item) => item.points.length > 0);
    return hasPersistedData ? snapshot : getMemorySnapshot();
  } catch (error) {
    console.warn(`[source-health] local snapshot failed, fallback to memory: ${normalizeError(error)}`);
    return getMemorySnapshot();
  }
}

export async function resetSourceHealthSnapshot(): Promise<void> {
  for (const key of SOURCE_KEYS) {
    sourceHealthState[key] = createEmptyState();
  }
  if (hasVercelPostgres) {
    await ensureEventsTable();
    const sql = await getSqlTag();
    await sql`DELETE FROM source_health_events`;
    return;
  }
  await clearLocalEvents();
}

export async function fetchWithSourceHealth(
  source: DataSourceKey,
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const start = Date.now();
  try {
    const response = await fetch(input, init);
    const latency = Date.now() - start;
    if (response.ok) {
      recordSourceHealth(source, "success", latency);
    } else {
      recordSourceHealth(source, "failed", latency, `HTTP ${response.status}`);
    }
    return response;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceHealth(source, "failed", latency, error);
    throw error;
  }
}
