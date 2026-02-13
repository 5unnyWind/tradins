import { listConclusionDriftPoints } from "@/lib/db";
import { normalizeTradableSymbol } from "@/lib/instruments";
import type { ConclusionDriftMetrics, ConclusionDriftPoint, ConclusionDriftReport } from "@/lib/types";

export interface DriftInput {
  symbol: string;
  limit: number;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return clampInt(value, 5, 300);
}

function toScore(values: number[]): number | null {
  if (!values.length) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number(avg.toFixed(2));
}

function countChanges(points: ConclusionDriftPoint[]): number {
  let last: ConclusionDriftPoint["recommendation"] = null;
  let changes = 0;
  for (const point of points) {
    if (point.recommendation === null) continue;
    if (last !== null && point.recommendation !== last) {
      changes += 1;
    }
    last = point.recommendation;
  }
  return changes;
}

function buildMetrics(points: ConclusionDriftPoint[]): ConclusionDriftMetrics {
  let buyCount = 0;
  let holdCount = 0;
  let reduceCount = 0;
  let sellCount = 0;
  const confidences: number[] = [];

  for (const point of points) {
    if (point.recommendation === "买入") buyCount += 1;
    if (point.recommendation === "观望") holdCount += 1;
    if (point.recommendation === "减仓") reduceCount += 1;
    if (point.recommendation === "卖出") sellCount += 1;
    if (Number.isFinite(point.confidence)) confidences.push(point.confidence as number);
  }

  return {
    sampleCount: points.length,
    changeCount: countChanges(points),
    buyCount,
    holdCount,
    reduceCount,
    sellCount,
    averageConfidence: toScore(confidences),
    maxConfidence: confidences.length ? Number(Math.max(...confidences).toFixed(2)) : null,
    minConfidence: confidences.length ? Number(Math.min(...confidences).toFixed(2)) : null,
  };
}

export async function runConclusionDrift(input: DriftInput): Promise<ConclusionDriftReport> {
  const symbol = normalizeTradableSymbol(input.symbol.trim());
  const limit = normalizeLimit(input.limit);
  if (!symbol) {
    throw new Error("股票代码不能为空");
  }

  const points = await listConclusionDriftPoints(symbol, limit);
  if (!points.length) {
    throw new Error("暂无可用记录，请先对该标的执行几次分析。");
  }

  return {
    symbol,
    limit,
    metrics: buildMetrics(points),
    points,
  };
}
