import { promises as fs } from "node:fs";
import path from "node:path";

export type IntelProvider = "valve" | "pro";

export interface IntelEventInput {
  provider: IntelProvider;
  eventId: string;
  eventTime: string;
  eventType: string | null;
  severity: string | null;
  title: string;
  summary: string;
  url: string | null;
  payload: Record<string, unknown>;
  fetchedAt: string;
}

export interface IntelImpactInput {
  provider: IntelProvider;
  goodsId: number;
  goodsName: string | null;
  eventId: string;
  eventTime: string;
  impactScore: number | null;
  relevanceScore: number | null;
  direction: string | null;
  returnH1: number | null;
  returnH24: number | null;
  returnH72: number | null;
  payload: Record<string, unknown>;
  fetchedAt: string;
}

export interface IntelEventRecord extends IntelEventInput {
  id: number;
  createdAt: string;
  updatedAt: string;
}

export interface IntelImpactRecord extends IntelImpactInput {
  id: number;
  createdAt: string;
  updatedAt: string;
}

export interface IntelRunState {
  jobKey: string;
  lastRanAt: string | null;
  lastStatus: "idle" | "success" | "failed";
  lastMessage: string | null;
  updatedAt: string;
}

export interface IntelEvaluationProviderMetrics {
  provider: IntelProvider;
  sampleCount: number;
  upRatePct: number | null;
  avgReturnH24Pct: number | null;
  avgAbsReturnH24Pct: number | null;
  avgImpactScore: number | null;
  avgRelevanceScore: number | null;
  impactReturnCorrelation: number | null;
}

export interface IntelEvaluationReport {
  generatedAt: string;
  lookbackDays: number;
  goodsId: number | null;
  metrics: IntelEvaluationProviderMetrics[];
  topImpacts: IntelImpactRecord[];
  recentEvents: IntelEventRecord[];
  runState: IntelRunState[];
}

export interface IntelAlertsReport {
  generatedAt: string;
  lookbackHours: number;
  thresholds: {
    impactScore: number;
    return24AbsPct: number;
    relevanceScore: number;
  };
  alerts: IntelAlertItem[];
}

export interface IntelAlertItem {
  id: string;
  provider: IntelProvider;
  goodsId: number;
  goodsName: string | null;
  eventId: string;
  eventTime: string;
  title: string;
  impactScore: number | null;
  relevanceScore: number | null;
  returnH24Pct: number | null;
  direction: string | null;
  severity: "high" | "medium";
  reasons: string[];
  payload: Record<string, unknown>;
}

export interface ListIntelImpactsOptions {
  provider?: IntelProvider;
  goodsId?: number;
  lookbackDays?: number;
  limit?: number;
}

export interface ListIntelEventsOptions {
  provider?: IntelProvider;
  lookbackDays?: number;
  limit?: number;
}

const hasVercelPostgres = Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL);

const localEventsFile = path.join(process.cwd(), ".tradins-local-intel-events.json");
const localImpactsFile = path.join(process.cwd(), ".tradins-local-intel-impacts.json");
const localRunsFile = path.join(process.cwd(), ".tradins-local-intel-runs.json");

const LOCAL_EVENTS_LIMIT = 60_000;
const LOCAL_IMPACTS_LIMIT = 80_000;

let ensuredTables: Promise<void> | null = null;

type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<{ rows: Array<Record<string, unknown>> }>;

let sqlTag: SqlTag | null = null;

let localEventsCache: IntelEventRecord[] | null = null;
let localImpactsCache: IntelImpactRecord[] | null = null;
let localRunsCache: IntelRunState[] | null = null;

let localEventsWriteQueue: Promise<void> = Promise.resolve();
let localImpactsWriteQueue: Promise<void> = Promise.resolve();
let localRunsWriteQueue: Promise<void> = Promise.resolve();

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function toNumberOrNull(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeProvider(value: unknown): IntelProvider | null {
  if (value === "valve" || value === "pro") return value;
  return null;
}

function toSafePayload(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function normalizeRunStatus(value: unknown): IntelRunState["lastStatus"] {
  if (value === "success" || value === "failed") return value;
  return "idle";
}

function parseLocalEvent(raw: unknown): IntelEventRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const provider = normalizeProvider(row.provider);
  const eventId = normalizeOptionalText(row.eventId);
  const eventTime = toIsoOrNull(row.eventTime);
  const title = normalizeOptionalText(row.title);
  const fetchedAt = toIsoOrNull(row.fetchedAt);
  const createdAt = toIsoOrNull(row.createdAt);
  const updatedAt = toIsoOrNull(row.updatedAt);
  const id = toNumberOrNull(row.id);
  if (!provider || !eventId || !eventTime || !title || !fetchedAt || !createdAt || !updatedAt || id === null) {
    return null;
  }

  return {
    id,
    provider,
    eventId,
    eventTime,
    eventType: normalizeOptionalText(row.eventType),
    severity: normalizeOptionalText(row.severity),
    title,
    summary: normalizeOptionalText(row.summary) ?? "",
    url: normalizeOptionalText(row.url),
    payload: toSafePayload(row.payload),
    fetchedAt,
    createdAt,
    updatedAt,
  };
}

function parseLocalImpact(raw: unknown): IntelImpactRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const provider = normalizeProvider(row.provider);
  const id = toNumberOrNull(row.id);
  const goodsId = toNumberOrNull(row.goodsId);
  const eventId = normalizeOptionalText(row.eventId);
  const eventTime = toIsoOrNull(row.eventTime);
  const fetchedAt = toIsoOrNull(row.fetchedAt);
  const createdAt = toIsoOrNull(row.createdAt);
  const updatedAt = toIsoOrNull(row.updatedAt);

  if (!provider || id === null || goodsId === null || !eventId || !eventTime || !fetchedAt || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    provider,
    goodsId,
    goodsName: normalizeOptionalText(row.goodsName),
    eventId,
    eventTime,
    impactScore: toNumberOrNull(row.impactScore),
    relevanceScore: toNumberOrNull(row.relevanceScore),
    direction: normalizeOptionalText(row.direction),
    returnH1: toNumberOrNull(row.returnH1),
    returnH24: toNumberOrNull(row.returnH24),
    returnH72: toNumberOrNull(row.returnH72),
    payload: toSafePayload(row.payload),
    fetchedAt,
    createdAt,
    updatedAt,
  };
}

function parseLocalRun(raw: unknown): IntelRunState | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const jobKey = normalizeOptionalText(row.jobKey);
  const updatedAt = toIsoOrNull(row.updatedAt);
  if (!jobKey || !updatedAt) return null;

  return {
    jobKey,
    lastRanAt: toIsoOrNull(row.lastRanAt),
    lastStatus: normalizeRunStatus(row.lastStatus),
    lastMessage: normalizeOptionalText(row.lastMessage),
    updatedAt,
  };
}

async function readLocalFile<T>(
  filePath: string,
  parser: (raw: unknown) => T | null,
): Promise<T[]> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parser).filter((item): item is T => item !== null);
  } catch {
    return [];
  }
}

async function readLocalEvents(): Promise<IntelEventRecord[]> {
  if (localEventsCache) return localEventsCache;
  localEventsCache = await readLocalFile(localEventsFile, parseLocalEvent);
  return localEventsCache;
}

async function readLocalImpacts(): Promise<IntelImpactRecord[]> {
  if (localImpactsCache) return localImpactsCache;
  localImpactsCache = await readLocalFile(localImpactsFile, parseLocalImpact);
  return localImpactsCache;
}

async function readLocalRuns(): Promise<IntelRunState[]> {
  if (localRunsCache) return localRunsCache;
  localRunsCache = await readLocalFile(localRunsFile, parseLocalRun);
  return localRunsCache;
}

async function writeLocalEvents(records: IntelEventRecord[]): Promise<void> {
  localEventsCache = records;
  await fs.writeFile(localEventsFile, JSON.stringify(records, null, 2), "utf-8");
}

async function writeLocalImpacts(records: IntelImpactRecord[]): Promise<void> {
  localImpactsCache = records;
  await fs.writeFile(localImpactsFile, JSON.stringify(records, null, 2), "utf-8");
}

async function writeLocalRuns(records: IntelRunState[]): Promise<void> {
  localRunsCache = records;
  await fs.writeFile(localRunsFile, JSON.stringify(records, null, 2), "utf-8");
}

function queueLocalEventsWrite(
  updater: (records: IntelEventRecord[]) => IntelEventRecord[],
): Promise<void> {
  localEventsWriteQueue = localEventsWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const current = await readLocalEvents();
      await writeLocalEvents(updater(current));
    });
  return localEventsWriteQueue;
}

function queueLocalImpactsWrite(
  updater: (records: IntelImpactRecord[]) => IntelImpactRecord[],
): Promise<void> {
  localImpactsWriteQueue = localImpactsWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const current = await readLocalImpacts();
      await writeLocalImpacts(updater(current));
    });
  return localImpactsWriteQueue;
}

function queueLocalRunsWrite(
  updater: (records: IntelRunState[]) => IntelRunState[],
): Promise<void> {
  localRunsWriteQueue = localRunsWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const current = await readLocalRuns();
      await writeLocalRuns(updater(current));
    });
  return localRunsWriteQueue;
}

async function getSqlTag(): Promise<SqlTag> {
  if (!sqlTag) {
    const mod = await import("@vercel/postgres");
    sqlTag = mod.sql as unknown as SqlTag;
  }
  return sqlTag;
}

async function ensureTables(): Promise<void> {
  if (!hasVercelPostgres) return;
  if (!ensuredTables) {
    ensuredTables = (async () => {
      const sql = await getSqlTag();
      await sql`
        CREATE TABLE IF NOT EXISTS intel_events (
          id SERIAL PRIMARY KEY,
          provider TEXT NOT NULL,
          event_id TEXT NOT NULL,
          event_time TIMESTAMPTZ NOT NULL,
          event_type TEXT,
          severity TEXT,
          title TEXT NOT NULL,
          summary TEXT,
          url TEXT,
          payload JSONB NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(provider, event_id)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_intel_events_provider_time
        ON intel_events (provider, event_time DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS intel_impacts (
          id SERIAL PRIMARY KEY,
          provider TEXT NOT NULL,
          goods_id BIGINT NOT NULL,
          goods_name TEXT,
          event_id TEXT NOT NULL,
          event_time TIMESTAMPTZ NOT NULL,
          impact_score DOUBLE PRECISION,
          relevance_score DOUBLE PRECISION,
          direction TEXT,
          return_h1 DOUBLE PRECISION,
          return_h24 DOUBLE PRECISION,
          return_h72 DOUBLE PRECISION,
          payload JSONB NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(provider, goods_id, event_id)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_intel_impacts_provider_goods_time
        ON intel_impacts (provider, goods_id, event_time DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_intel_impacts_event_time
        ON intel_impacts (event_time DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS intel_pipeline_runs (
          job_key TEXT PRIMARY KEY,
          last_ran_at TIMESTAMPTZ,
          last_status TEXT NOT NULL DEFAULT 'idle',
          last_message TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })();
  }
  await ensuredTables;
}

export function intelStorageMode(): "vercel_postgres" | "local" {
  return hasVercelPostgres ? "vercel_postgres" : "local";
}

export async function upsertIntelEvents(events: IntelEventInput[]): Promise<number> {
  if (!events.length) return 0;

  if (!hasVercelPostgres) {
    await queueLocalEventsWrite((records) => {
      const next = [...records];
      const now = new Date().toISOString();
      let nextId = Math.max(0, ...next.map((row) => row.id)) + 1;

      for (const event of events) {
        const idx = next.findIndex(
          (row) => row.provider === event.provider && row.eventId === event.eventId,
        );
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            ...event,
            updatedAt: now,
          };
          continue;
        }

        const id = nextId;
        nextId += 1;
        next.unshift({
          id,
          ...event,
          createdAt: now,
          updatedAt: now,
        });
      }

      next.sort(
        (left, right) =>
          new Date(right.eventTime).getTime() - new Date(left.eventTime).getTime() || right.id - left.id,
      );
      if (next.length > LOCAL_EVENTS_LIMIT) {
        next.splice(LOCAL_EVENTS_LIMIT);
      }
      return next;
    });
    return events.length;
  }

  await ensureTables();
  const sql = await getSqlTag();
  for (const event of events) {
    await sql`
      INSERT INTO intel_events (
        provider, event_id, event_time, event_type, severity, title, summary, url, payload, fetched_at
      )
      VALUES (
        ${event.provider},
        ${event.eventId},
        ${event.eventTime},
        ${event.eventType},
        ${event.severity},
        ${event.title},
        ${event.summary},
        ${event.url},
        ${JSON.stringify(event.payload)},
        ${event.fetchedAt}
      )
      ON CONFLICT (provider, event_id)
      DO UPDATE SET
        event_time = EXCLUDED.event_time,
        event_type = EXCLUDED.event_type,
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        url = EXCLUDED.url,
        payload = EXCLUDED.payload,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = NOW()
    `;
  }
  return events.length;
}

export async function upsertIntelImpacts(impacts: IntelImpactInput[]): Promise<number> {
  if (!impacts.length) return 0;

  if (!hasVercelPostgres) {
    await queueLocalImpactsWrite((records) => {
      const next = [...records];
      const now = new Date().toISOString();
      let nextId = Math.max(0, ...next.map((row) => row.id)) + 1;

      for (const impact of impacts) {
        const idx = next.findIndex(
          (row) =>
            row.provider === impact.provider &&
            row.goodsId === impact.goodsId &&
            row.eventId === impact.eventId,
        );

        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            ...impact,
            updatedAt: now,
          };
          continue;
        }

        const id = nextId;
        nextId += 1;
        next.unshift({
          id,
          ...impact,
          createdAt: now,
          updatedAt: now,
        });
      }

      next.sort(
        (left, right) =>
          new Date(right.eventTime).getTime() - new Date(left.eventTime).getTime() || right.id - left.id,
      );
      if (next.length > LOCAL_IMPACTS_LIMIT) {
        next.splice(LOCAL_IMPACTS_LIMIT);
      }
      return next;
    });
    return impacts.length;
  }

  await ensureTables();
  const sql = await getSqlTag();
  for (const impact of impacts) {
    await sql`
      INSERT INTO intel_impacts (
        provider, goods_id, goods_name, event_id, event_time,
        impact_score, relevance_score, direction,
        return_h1, return_h24, return_h72,
        payload, fetched_at
      )
      VALUES (
        ${impact.provider},
        ${impact.goodsId},
        ${impact.goodsName},
        ${impact.eventId},
        ${impact.eventTime},
        ${impact.impactScore},
        ${impact.relevanceScore},
        ${impact.direction},
        ${impact.returnH1},
        ${impact.returnH24},
        ${impact.returnH72},
        ${JSON.stringify(impact.payload)},
        ${impact.fetchedAt}
      )
      ON CONFLICT (provider, goods_id, event_id)
      DO UPDATE SET
        goods_name = EXCLUDED.goods_name,
        event_time = EXCLUDED.event_time,
        impact_score = EXCLUDED.impact_score,
        relevance_score = EXCLUDED.relevance_score,
        direction = EXCLUDED.direction,
        return_h1 = EXCLUDED.return_h1,
        return_h24 = EXCLUDED.return_h24,
        return_h72 = EXCLUDED.return_h72,
        payload = EXCLUDED.payload,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = NOW()
    `;
  }

  return impacts.length;
}

export async function getIntelRunState(jobKey: string): Promise<IntelRunState | null> {
  const normalizedKey = jobKey.trim();
  if (!normalizedKey) return null;

  if (!hasVercelPostgres) {
    const runs = await readLocalRuns();
    return runs.find((row) => row.jobKey === normalizedKey) ?? null;
  }

  await ensureTables();
  const sql = await getSqlTag();
  const rows = (await sql`
    SELECT job_key, last_ran_at, last_status, last_message, updated_at
    FROM intel_pipeline_runs
    WHERE job_key = ${normalizedKey}
    LIMIT 1
  `) as {
    rows: Array<{
      job_key: string;
      last_ran_at: string | null;
      last_status: string;
      last_message: string | null;
      updated_at: string;
    }>;
  };

  const row = rows.rows[0];
  if (!row) return null;
  return {
    jobKey: row.job_key,
    lastRanAt: row.last_ran_at ? new Date(row.last_ran_at).toISOString() : null,
    lastStatus: normalizeRunStatus(row.last_status),
    lastMessage: row.last_message,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listIntelRunStates(): Promise<IntelRunState[]> {
  if (!hasVercelPostgres) {
    const runs = await readLocalRuns();
    return runs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  await ensureTables();
  const sql = await getSqlTag();
  const rows = (await sql`
    SELECT job_key, last_ran_at, last_status, last_message, updated_at
    FROM intel_pipeline_runs
    ORDER BY updated_at DESC
  `) as {
    rows: Array<{
      job_key: string;
      last_ran_at: string | null;
      last_status: string;
      last_message: string | null;
      updated_at: string;
    }>;
  };

  return rows.rows.map((row) => ({
    jobKey: row.job_key,
    lastRanAt: row.last_ran_at ? new Date(row.last_ran_at).toISOString() : null,
    lastStatus: normalizeRunStatus(row.last_status),
    lastMessage: row.last_message,
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export async function saveIntelRunState(
  jobKey: string,
  status: IntelRunState["lastStatus"],
  message: string,
  ranAt = new Date().toISOString(),
): Promise<void> {
  const normalizedKey = jobKey.trim();
  if (!normalizedKey) return;

  if (!hasVercelPostgres) {
    await queueLocalRunsWrite((records) => {
      const now = new Date().toISOString();
      const idx = records.findIndex((row) => row.jobKey === normalizedKey);
      const next = [...records];
      const newRow: IntelRunState = {
        jobKey: normalizedKey,
        lastRanAt: ranAt,
        lastStatus: status,
        lastMessage: message,
        updatedAt: now,
      };
      if (idx >= 0) {
        next[idx] = newRow;
      } else {
        next.unshift(newRow);
      }
      return next;
    });
    return;
  }

  await ensureTables();
  const sql = await getSqlTag();
  await sql`
    INSERT INTO intel_pipeline_runs (job_key, last_ran_at, last_status, last_message, updated_at)
    VALUES (${normalizedKey}, ${ranAt}, ${status}, ${message}, NOW())
    ON CONFLICT (job_key)
    DO UPDATE SET
      last_ran_at = EXCLUDED.last_ran_at,
      last_status = EXCLUDED.last_status,
      last_message = EXCLUDED.last_message,
      updated_at = NOW()
  `;
}

function mapEventRow(row: Record<string, unknown>): IntelEventRecord {
  return {
    id: Number(row.id ?? 0),
    provider: normalizeProvider(row.provider) ?? "valve",
    eventId: String(row.event_id ?? row.eventId ?? ""),
    eventTime: new Date(String(row.event_time ?? row.eventTime)).toISOString(),
    eventType: normalizeOptionalText(row.event_type ?? row.eventType),
    severity: normalizeOptionalText(row.severity),
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    url: normalizeOptionalText(row.url),
    payload: toSafePayload(row.payload),
    fetchedAt: new Date(String(row.fetched_at ?? row.fetchedAt)).toISOString(),
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.updatedAt)).toISOString(),
  };
}

function mapImpactRow(row: Record<string, unknown>): IntelImpactRecord {
  return {
    id: Number(row.id ?? 0),
    provider: normalizeProvider(row.provider) ?? "valve",
    goodsId: Number(row.goods_id ?? row.goodsId ?? 0),
    goodsName: normalizeOptionalText(row.goods_name ?? row.goodsName),
    eventId: String(row.event_id ?? row.eventId ?? ""),
    eventTime: new Date(String(row.event_time ?? row.eventTime)).toISOString(),
    impactScore: toNumberOrNull(row.impact_score ?? row.impactScore),
    relevanceScore: toNumberOrNull(row.relevance_score ?? row.relevanceScore),
    direction: normalizeOptionalText(row.direction),
    returnH1: toNumberOrNull(row.return_h1 ?? row.returnH1),
    returnH24: toNumberOrNull(row.return_h24 ?? row.returnH24),
    returnH72: toNumberOrNull(row.return_h72 ?? row.returnH72),
    payload: toSafePayload(row.payload),
    fetchedAt: new Date(String(row.fetched_at ?? row.fetchedAt)).toISOString(),
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.updatedAt)).toISOString(),
  };
}

export async function listIntelEvents(options: ListIntelEventsOptions = {}): Promise<IntelEventRecord[]> {
  const limit = clampInt(options.limit ?? 40, 1, 400);
  const lookbackDays = clampInt(options.lookbackDays ?? 90, 1, 3650);

  if (!hasVercelPostgres) {
    const events = await readLocalEvents();
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    return events
      .filter((event) => {
        if (options.provider && event.provider !== options.provider) return false;
        return new Date(event.eventTime).getTime() >= cutoff;
      })
      .sort((left, right) => new Date(right.eventTime).getTime() - new Date(left.eventTime).getTime())
      .slice(0, limit);
  }

  await ensureTables();
  const sql = await getSqlTag();

  const runQuery = async (provider?: IntelProvider): Promise<IntelEventRecord[]> => {
    const rows = provider
      ? ((await sql`
          SELECT id, provider, event_id, event_time, event_type, severity, title, summary, url, payload, fetched_at, created_at, updated_at
          FROM intel_events
          WHERE provider = ${provider}
            AND event_time >= NOW() - (${lookbackDays} * INTERVAL '1 day')
          ORDER BY event_time DESC, id DESC
          LIMIT ${limit}
        `) as { rows: Array<Record<string, unknown>> })
      : ((await sql`
          SELECT id, provider, event_id, event_time, event_type, severity, title, summary, url, payload, fetched_at, created_at, updated_at
          FROM intel_events
          WHERE event_time >= NOW() - (${lookbackDays} * INTERVAL '1 day')
          ORDER BY event_time DESC, id DESC
          LIMIT ${limit}
        `) as { rows: Array<Record<string, unknown>> });
    return rows.rows.map(mapEventRow);
  };

  return runQuery(options.provider);
}

export async function listIntelImpacts(options: ListIntelImpactsOptions = {}): Promise<IntelImpactRecord[]> {
  const limit = clampInt(options.limit ?? 120, 1, 1000);
  const lookbackDays = clampInt(options.lookbackDays ?? 90, 1, 3650);

  if (!hasVercelPostgres) {
    const impacts = await readLocalImpacts();
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    return impacts
      .filter((impact) => {
        if (options.provider && impact.provider !== options.provider) return false;
        if (options.goodsId !== undefined && impact.goodsId !== options.goodsId) return false;
        return new Date(impact.eventTime).getTime() >= cutoff;
      })
      .sort((left, right) => new Date(right.eventTime).getTime() - new Date(left.eventTime).getTime())
      .slice(0, limit);
  }

  await ensureTables();
  const sql = await getSqlTag();

  const rows =
    options.provider !== undefined && options.goodsId !== undefined
      ? ((await sql`
          SELECT id, provider, goods_id, goods_name, event_id, event_time, impact_score, relevance_score, direction,
            return_h1, return_h24, return_h72, payload, fetched_at, created_at, updated_at
          FROM intel_impacts
          WHERE provider = ${options.provider}
            AND goods_id = ${options.goodsId}
            AND event_time >= NOW() - (${lookbackDays} * INTERVAL '1 day')
          ORDER BY event_time DESC, id DESC
          LIMIT ${limit}
        `) as { rows: Array<Record<string, unknown>> })
      : options.provider !== undefined
        ? ((await sql`
            SELECT id, provider, goods_id, goods_name, event_id, event_time, impact_score, relevance_score, direction,
              return_h1, return_h24, return_h72, payload, fetched_at, created_at, updated_at
            FROM intel_impacts
            WHERE provider = ${options.provider}
              AND event_time >= NOW() - (${lookbackDays} * INTERVAL '1 day')
            ORDER BY event_time DESC, id DESC
            LIMIT ${limit}
          `) as { rows: Array<Record<string, unknown>> })
        : options.goodsId !== undefined
          ? ((await sql`
              SELECT id, provider, goods_id, goods_name, event_id, event_time, impact_score, relevance_score, direction,
                return_h1, return_h24, return_h72, payload, fetched_at, created_at, updated_at
              FROM intel_impacts
              WHERE goods_id = ${options.goodsId}
                AND event_time >= NOW() - (${lookbackDays} * INTERVAL '1 day')
              ORDER BY event_time DESC, id DESC
              LIMIT ${limit}
            `) as { rows: Array<Record<string, unknown>> })
          : ((await sql`
              SELECT id, provider, goods_id, goods_name, event_id, event_time, impact_score, relevance_score, direction,
                return_h1, return_h24, return_h72, payload, fetched_at, created_at, updated_at
              FROM intel_impacts
              WHERE event_time >= NOW() - (${lookbackDays} * INTERVAL '1 day')
              ORDER BY event_time DESC, id DESC
              LIMIT ${limit}
            `) as { rows: Array<Record<string, unknown>> });

  return rows.rows.map(mapImpactRow);
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Number((sum / values.length).toFixed(4));
}

function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const xMean = avg(xs);
  const yMean = avg(ys);
  if (xMean === null || yMean === null) return null;

  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let idx = 0; idx < xs.length; idx += 1) {
    const xDelta = xs[idx] - xMean;
    const yDelta = ys[idx] - yMean;
    numerator += xDelta * yDelta;
    xVariance += xDelta * xDelta;
    yVariance += yDelta * yDelta;
  }
  if (xVariance <= 0 || yVariance <= 0) return null;
  const corr = numerator / Math.sqrt(xVariance * yVariance);
  return Number(corr.toFixed(4));
}

export async function buildIntelEvaluationReport(options?: {
  lookbackDays?: number;
  goodsId?: number;
}): Promise<IntelEvaluationReport> {
  const lookbackDays = clampInt(options?.lookbackDays ?? 60, 1, 3650);
  const goodsId = options?.goodsId;

  const [impacts, events, runState] = await Promise.all([
    listIntelImpacts({ lookbackDays, goodsId, limit: 3000 }),
    listIntelEvents({ lookbackDays, limit: 200 }),
    listIntelRunStates(),
  ]);

  const providers: IntelProvider[] = ["valve", "pro"];
  const metrics = providers.map((provider) => {
    const rows = impacts.filter((row) => row.provider === provider);
    const returns24 = rows
      .map((row) => row.returnH24)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const absReturns24 = returns24.map((value) => Math.abs(value));
    const positiveCount = returns24.filter((value) => value > 0).length;
    const impactScores = rows
      .map((row) => row.impactScore)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const relevanceScores = rows
      .map((row) => row.relevanceScore)
      .filter((value): value is number => value !== null && Number.isFinite(value));

    const corrRows = rows.filter(
      (row) => row.impactScore !== null && row.returnH24 !== null && Number.isFinite(row.impactScore) && Number.isFinite(row.returnH24),
    );
    const corr = pearsonCorrelation(
      corrRows.map((row) => Number(row.impactScore)),
      corrRows.map((row) => Math.abs(Number(row.returnH24))),
    );

    return {
      provider,
      sampleCount: rows.length,
      upRatePct: pct(positiveCount, returns24.length),
      avgReturnH24Pct: avg(returns24),
      avgAbsReturnH24Pct: avg(absReturns24),
      avgImpactScore: avg(impactScores),
      avgRelevanceScore: avg(relevanceScores),
      impactReturnCorrelation: corr,
    } satisfies IntelEvaluationProviderMetrics;
  });

  const topImpacts = [...impacts]
    .sort((left, right) => {
      const leftAbs = Math.abs(left.returnH24 ?? 0);
      const rightAbs = Math.abs(right.returnH24 ?? 0);
      if (rightAbs !== leftAbs) return rightAbs - leftAbs;
      return new Date(right.eventTime).getTime() - new Date(left.eventTime).getTime();
    })
    .slice(0, 40);

  return {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    goodsId: goodsId ?? null,
    metrics,
    topImpacts,
    recentEvents: events.slice(0, 60),
    runState,
  };
}

function parseThreshold(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export async function buildIntelAlertsReport(options?: {
  lookbackHours?: number;
  impactScoreThreshold?: number;
  return24AbsThreshold?: number;
  relevanceScoreThreshold?: number;
  goodsId?: number;
}): Promise<IntelAlertsReport> {
  const lookbackHours = clampInt(options?.lookbackHours ?? 48, 1, 24 * 30);
  const impactScoreThreshold =
    options?.impactScoreThreshold ??
    parseThreshold(process.env.INTEL_ALERT_IMPACT_SCORE_THRESHOLD, 1, 0.1, 100);
  const return24AbsThreshold =
    options?.return24AbsThreshold ??
    parseThreshold(process.env.INTEL_ALERT_RETURN_24H_ABS_THRESHOLD, 5, 0.1, 1000);
  const relevanceScoreThreshold =
    options?.relevanceScoreThreshold ??
    parseThreshold(process.env.INTEL_ALERT_RELEVANCE_THRESHOLD, 0.35, 0, 1);

  const lookbackDays = Math.max(1, Math.ceil(lookbackHours / 24));
  const impacts = await listIntelImpacts({
    lookbackDays,
    goodsId: options?.goodsId,
    limit: 3000,
  });

  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  const alerts: IntelAlertItem[] = [];

  for (const impact of impacts) {
    const eventTs = new Date(impact.eventTime).getTime();
    if (!Number.isFinite(eventTs) || eventTs < cutoff) continue;

    const absReturn24 = Math.abs(impact.returnH24 ?? 0);
    const impactScore = impact.impactScore ?? 0;
    const relevance = impact.relevanceScore ?? 0;

    const primaryTrigger = impactScore >= impactScoreThreshold && absReturn24 >= return24AbsThreshold;
    const proTrigger =
      impact.provider === "pro" &&
      relevance >= relevanceScoreThreshold &&
      absReturn24 >= return24AbsThreshold * 0.5;

    if (!primaryTrigger && !proTrigger) continue;

    const reasons: string[] = [];
    if (impactScore >= impactScoreThreshold) reasons.push(`impact_score=${impactScore.toFixed(3)}`);
    if (relevance >= relevanceScoreThreshold) reasons.push(`relevance=${relevance.toFixed(3)}`);
    reasons.push(`|24h|=${absReturn24.toFixed(2)}%`);

    const severity: "high" | "medium" =
      absReturn24 >= return24AbsThreshold * 1.5 ||
      impactScore >= impactScoreThreshold * 2
        ? "high"
        : "medium";

    const title = normalizeOptionalText(impact.payload?.title) ?? `event ${impact.eventId}`;

    alerts.push({
      id: `${impact.provider}:${impact.goodsId}:${impact.eventId}`,
      provider: impact.provider,
      goodsId: impact.goodsId,
      goodsName: impact.goodsName,
      eventId: impact.eventId,
      eventTime: impact.eventTime,
      title,
      impactScore: impact.impactScore,
      relevanceScore: impact.relevanceScore,
      returnH24Pct: impact.returnH24,
      direction: impact.direction,
      severity,
      reasons,
      payload: impact.payload,
    });
  }

  alerts.sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "high" ? -1 : 1;
    const leftReturn = Math.abs(left.returnH24Pct ?? 0);
    const rightReturn = Math.abs(right.returnH24Pct ?? 0);
    if (rightReturn !== leftReturn) return rightReturn - leftReturn;
    return new Date(right.eventTime).getTime() - new Date(left.eventTime).getTime();
  });

  return {
    generatedAt: new Date().toISOString(),
    lookbackHours,
    thresholds: {
      impactScore: impactScoreThreshold,
      return24AbsPct: return24AbsThreshold,
      relevanceScore: relevanceScoreThreshold,
    },
    alerts: alerts.slice(0, 100),
  };
}
