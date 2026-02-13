import { normalizeAnalysisInput } from "@/lib/config";
import type {
  SchedulerRunStatus,
  SchedulerTask,
  SchedulerTaskCreateInput,
  SchedulerTaskUpdateInput,
} from "@/lib/types";
import { promises as fs } from "node:fs";
import path from "node:path";

const hasVercelPostgres = Boolean(
  process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL,
);

let ensuredTable: Promise<void> | null = null;
const localStoreFile = path.join(process.cwd(), ".tradins-local-scheduler.json");

type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<{ rows: Array<Record<string, unknown>> }>;

let sqlTag: SqlTag | null = null;

type SchedulerRow = {
  id: number;
  name: string;
  symbol: string;
  analysis_mode: string;
  debate_rounds: number;
  period: string;
  interval: string;
  interval_minutes: number;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string;
  last_run_message: string | null;
  created_at: string;
  updated_at: string;
};

async function getSqlTag(): Promise<SqlTag> {
  if (!sqlTag) {
    const mod = await import("@vercel/postgres");
    sqlTag = mod.sql as unknown as SqlTag;
  }
  return sqlTag;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function sanitizeIntervalMinutes(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return clampInt(value, 1, 7 * 24 * 60);
}

export function computeNextRunAt(intervalMinutes: number, base = new Date()): string {
  const safeMinutes = sanitizeIntervalMinutes(intervalMinutes);
  return new Date(base.getTime() + safeMinutes * 60_000).toISOString();
}

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function normalizeRunStatus(value: string): SchedulerRunStatus {
  if (value === "success" || value === "failed") return value;
  return "idle";
}

function mapRow(row: SchedulerRow): SchedulerTask {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    analysisMode: row.analysis_mode as SchedulerTask["analysisMode"],
    debateRounds: row.debate_rounds,
    period: row.period,
    interval: row.interval,
    intervalMinutes: row.interval_minutes,
    enabled: row.enabled,
    nextRunAt: toIso(row.next_run_at),
    lastRunAt: toIso(row.last_run_at),
    lastRunStatus: normalizeRunStatus(row.last_run_status),
    lastRunMessage: row.last_run_message,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function ensureTable(): Promise<void> {
  if (!hasVercelPostgres) return;
  if (!ensuredTable) {
    ensuredTable = (async () => {
      const sql = await getSqlTag();
      await sql`
        CREATE TABLE IF NOT EXISTS scheduler_tasks (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          symbol TEXT NOT NULL,
          analysis_mode TEXT NOT NULL,
          debate_rounds INTEGER NOT NULL,
          period TEXT NOT NULL,
          interval TEXT NOT NULL,
          interval_minutes INTEGER NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          next_run_at TIMESTAMPTZ,
          last_run_at TIMESTAMPTZ,
          last_run_status TEXT NOT NULL DEFAULT 'idle',
          last_run_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_scheduler_tasks_due
        ON scheduler_tasks (enabled, next_run_at)
      `;
    })();
  }
  await ensuredTable;
}

async function readLocalStore(): Promise<SchedulerTask[]> {
  try {
    const raw = await fs.readFile(localStoreFile, "utf-8");
    const parsed = JSON.parse(raw) as SchedulerTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalStore(tasks: SchedulerTask[]): Promise<void> {
  await fs.writeFile(localStoreFile, JSON.stringify(tasks, null, 2), "utf-8");
}

export async function listSchedulerTasks(limit = 200): Promise<SchedulerTask[]> {
  const safeLimit = clampInt(limit, 1, 500);
  if (!hasVercelPostgres) {
    const tasks = await readLocalStore();
    return tasks.slice().sort((a, b) => b.id - a.id).slice(0, safeLimit);
  }
  await ensureTable();
  const sql = await getSqlTag();
  const rows = (await sql`
    SELECT
      id, name, symbol, analysis_mode, debate_rounds, period, interval, interval_minutes,
      enabled, next_run_at, last_run_at, last_run_status, last_run_message, created_at, updated_at
    FROM scheduler_tasks
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `) as { rows: SchedulerRow[] };
  return rows.rows.map(mapRow);
}

export async function getSchedulerTask(id: number): Promise<SchedulerTask | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!hasVercelPostgres) {
    const tasks = await readLocalStore();
    return tasks.find((task) => task.id === id) ?? null;
  }
  await ensureTable();
  const sql = await getSqlTag();
  const rows = (await sql`
    SELECT
      id, name, symbol, analysis_mode, debate_rounds, period, interval, interval_minutes,
      enabled, next_run_at, last_run_at, last_run_status, last_run_message, created_at, updated_at
    FROM scheduler_tasks
    WHERE id = ${id}
    LIMIT 1
  `) as { rows: SchedulerRow[] };
  const row = rows.rows[0];
  return row ? mapRow(row) : null;
}

export async function createSchedulerTask(input: SchedulerTaskCreateInput): Promise<SchedulerTask> {
  const normalized = normalizeAnalysisInput({
    symbol: input.symbol,
    analysisMode: input.analysisMode,
    debateRounds: input.debateRounds,
    period: input.period,
    interval: input.interval,
  });
  const intervalMinutes = sanitizeIntervalMinutes(input.intervalMinutes);
  const enabled = Boolean(input.enabled);
  const name = input.name.trim() || `${normalized.symbol} ${intervalMinutes}m`;
  const nextRunAt = enabled ? computeNextRunAt(intervalMinutes) : null;
  const nowIso = new Date().toISOString();

  if (!hasVercelPostgres) {
    const tasks = await readLocalStore();
    const id = (tasks[0]?.id ?? 0) + 1;
    const task: SchedulerTask = {
      id,
      name,
      symbol: normalized.symbol,
      analysisMode: normalized.analysisMode,
      debateRounds: normalized.debateRounds,
      period: normalized.period,
      interval: normalized.interval,
      intervalMinutes,
      enabled,
      nextRunAt,
      lastRunAt: null,
      lastRunStatus: "idle",
      lastRunMessage: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    tasks.unshift(task);
    await writeLocalStore(tasks.slice(0, 300));
    return task;
  }

  await ensureTable();
  const sql = await getSqlTag();
  const inserted = (await sql`
    INSERT INTO scheduler_tasks (
      name, symbol, analysis_mode, debate_rounds, period, interval, interval_minutes,
      enabled, next_run_at, last_run_status
    )
    VALUES (
      ${name}, ${normalized.symbol}, ${normalized.analysisMode}, ${normalized.debateRounds},
      ${normalized.period}, ${normalized.interval}, ${intervalMinutes},
      ${enabled}, ${nextRunAt}, ${"idle"}
    )
    RETURNING
      id, name, symbol, analysis_mode, debate_rounds, period, interval, interval_minutes,
      enabled, next_run_at, last_run_at, last_run_status, last_run_message, created_at, updated_at
  `) as { rows: SchedulerRow[] };
  return mapRow(inserted.rows[0]);
}

export async function updateSchedulerTask(
  id: number,
  patch: SchedulerTaskUpdateInput,
): Promise<SchedulerTask | null> {
  const current = await getSchedulerTask(id);
  if (!current) return null;

  const merged = {
    name: patch.name?.trim() || current.name,
    symbol: patch.symbol?.trim() || current.symbol,
    analysisMode: patch.analysisMode ?? current.analysisMode,
    debateRounds: patch.debateRounds ?? current.debateRounds,
    period: patch.period?.trim() || current.period,
    interval: patch.interval?.trim() || current.interval,
    intervalMinutes: sanitizeIntervalMinutes(patch.intervalMinutes ?? current.intervalMinutes),
    enabled: patch.enabled ?? current.enabled,
  } satisfies SchedulerTaskCreateInput;

  const normalized = normalizeAnalysisInput({
    symbol: merged.symbol,
    analysisMode: merged.analysisMode,
    debateRounds: merged.debateRounds,
    period: merged.period,
    interval: merged.interval,
  });
  const scheduleChanged =
    patch.symbol !== undefined ||
    patch.analysisMode !== undefined ||
    patch.debateRounds !== undefined ||
    patch.period !== undefined ||
    patch.interval !== undefined ||
    patch.intervalMinutes !== undefined;

  let nextRunAt = current.nextRunAt;
  if (!merged.enabled) {
    nextRunAt = null;
  } else if (!current.enabled || current.nextRunAt === null || scheduleChanged) {
    nextRunAt = computeNextRunAt(merged.intervalMinutes);
  }

  if (!hasVercelPostgres) {
    const tasks = await readLocalStore();
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) return null;
    const nowIso = new Date().toISOString();
    const updated: SchedulerTask = {
      ...tasks[index],
      name: merged.name,
      symbol: normalized.symbol,
      analysisMode: normalized.analysisMode,
      debateRounds: normalized.debateRounds,
      period: normalized.period,
      interval: normalized.interval,
      intervalMinutes: merged.intervalMinutes,
      enabled: merged.enabled,
      nextRunAt,
      updatedAt: nowIso,
    };
    tasks[index] = updated;
    await writeLocalStore(tasks);
    return updated;
  }

  await ensureTable();
  const sql = await getSqlTag();
  const updated = (await sql`
    UPDATE scheduler_tasks
    SET
      name = ${merged.name},
      symbol = ${normalized.symbol},
      analysis_mode = ${normalized.analysisMode},
      debate_rounds = ${normalized.debateRounds},
      period = ${normalized.period},
      interval = ${normalized.interval},
      interval_minutes = ${merged.intervalMinutes},
      enabled = ${merged.enabled},
      next_run_at = ${nextRunAt},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING
      id, name, symbol, analysis_mode, debate_rounds, period, interval, interval_minutes,
      enabled, next_run_at, last_run_at, last_run_status, last_run_message, created_at, updated_at
  `) as { rows: SchedulerRow[] };
  const row = updated.rows[0];
  return row ? mapRow(row) : null;
}

export async function deleteSchedulerTask(id: number): Promise<boolean> {
  if (!Number.isInteger(id) || id <= 0) return false;
  if (!hasVercelPostgres) {
    const tasks = await readLocalStore();
    const filtered = tasks.filter((task) => task.id !== id);
    if (filtered.length === tasks.length) return false;
    await writeLocalStore(filtered);
    return true;
  }
  await ensureTable();
  const sql = await getSqlTag();
  const deleted = (await sql`
    DELETE FROM scheduler_tasks
    WHERE id = ${id}
    RETURNING id
  `) as { rows: Array<{ id: number }> };
  return deleted.rows.length > 0;
}

export async function listDueSchedulerTasks(now = new Date(), limit = 5): Promise<SchedulerTask[]> {
  const safeLimit = clampInt(limit, 1, 20);
  const nowIso = now.toISOString();
  if (!hasVercelPostgres) {
    const tasks = await readLocalStore();
    return tasks
      .filter((task) => task.enabled && task.nextRunAt && task.nextRunAt <= nowIso)
      .sort((a, b) => (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? ""))
      .slice(0, safeLimit);
  }
  await ensureTable();
  const sql = await getSqlTag();
  const rows = (await sql`
    SELECT
      id, name, symbol, analysis_mode, debate_rounds, period, interval, interval_minutes,
      enabled, next_run_at, last_run_at, last_run_status, last_run_message, created_at, updated_at
    FROM scheduler_tasks
    WHERE enabled = TRUE
      AND next_run_at IS NOT NULL
      AND next_run_at <= ${nowIso}
    ORDER BY next_run_at ASC
    LIMIT ${safeLimit}
  `) as { rows: SchedulerRow[] };
  return rows.rows.map(mapRow);
}

export async function saveSchedulerTaskRunResult(args: {
  id: number;
  status: SchedulerRunStatus;
  message: string | null;
  nextRunAt: string | null;
  ranAt?: string;
}): Promise<void> {
  const ranAt = args.ranAt ?? new Date().toISOString();
  if (!hasVercelPostgres) {
    const tasks = await readLocalStore();
    const index = tasks.findIndex((task) => task.id === args.id);
    if (index < 0) return;
    tasks[index] = {
      ...tasks[index],
      lastRunAt: ranAt,
      lastRunStatus: args.status,
      lastRunMessage: args.message,
      nextRunAt: args.nextRunAt,
      updatedAt: ranAt,
    };
    await writeLocalStore(tasks);
    return;
  }
  await ensureTable();
  const sql = await getSqlTag();
  await sql`
    UPDATE scheduler_tasks
    SET
      last_run_at = ${ranAt},
      last_run_status = ${args.status},
      last_run_message = ${args.message},
      next_run_at = ${args.nextRunAt},
      updated_at = NOW()
    WHERE id = ${args.id}
  `;
}

export function currentSchedulerStorageMode(): "vercel_postgres" | "memory" {
  return hasVercelPostgres ? "vercel_postgres" : "memory";
}
