import type { DataSourceHealthItem, DataSourceHealthSnapshot, DataSourceKey } from "@/lib/types";

const SOURCE_KEYS: DataSourceKey[] = ["yahoo", "eastmoney", "reddit"];
const LATENCY_WINDOW = 240;

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

const sourceHealthState: Record<DataSourceKey, SourceHealthState> = {
  yahoo: createEmptyState(),
  eastmoney: createEmptyState(),
  reddit: createEmptyState(),
};

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

function toAvgLatency(state: SourceHealthState): number | null {
  if (!state.totalRequests) return null;
  return Number((state.totalLatencyMs / state.totalRequests).toFixed(2));
}

function toP95Latency(state: SourceHealthState): number | null {
  const p95 = percentile(state.latenciesMs, 0.95);
  if (p95 === null) return null;
  return Number(p95.toFixed(2));
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
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
  state.totalRequests += 1;
  state.totalLatencyMs += latency;
  pushLatency(state, latency);
  state.lastStatus = status;
  state.lastLatencyMs = latency;
  state.lastAt = new Date().toISOString();

  if (status === "success") {
    state.successRequests += 1;
    state.lastError = null;
    return;
  }

  state.failedRequests += 1;
  state.lastError = error ? normalizeError(error) : "unknown error";
}

function mapItem(source: DataSourceKey): DataSourceHealthItem {
  const state = sourceHealthState[source];
  return {
    source,
    totalRequests: state.totalRequests,
    successRequests: state.successRequests,
    failedRequests: state.failedRequests,
    hitRatePct: toRatePct(state.successRequests, state.totalRequests),
    failureRatePct: toRatePct(state.failedRequests, state.totalRequests),
    avgLatencyMs: toAvgLatency(state),
    p95LatencyMs: toP95Latency(state),
    lastStatus: state.lastStatus,
    lastError: state.lastError,
    lastLatencyMs: state.lastLatencyMs,
    lastAt: state.lastAt,
  };
}

export function getSourceHealthSnapshot(): DataSourceHealthSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    latencyWindowSize: LATENCY_WINDOW,
    sources: SOURCE_KEYS.map(mapItem),
  };
}

export function resetSourceHealthSnapshot(): void {
  for (const key of SOURCE_KEYS) {
    sourceHealthState[key] = createEmptyState();
  }
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
