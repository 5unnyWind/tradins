import {
  fetchBuffGoodsDashboard,
  type BuffAuthSource,
  type BuffCurrency,
  type BuffGame,
  type BuffSeriesPoint,
} from "@/lib/buff";
import { fetchProImpactForGoods, type ProImpactEvent } from "@/lib/data/pro-events";
import { fetchValveImpactForGoods, type ValveImpactEvent } from "@/lib/data/valve-updates";

export type BuffForecastTrend = "bullish" | "bearish" | "sideways";
export type BuffForecastRiskLevel = "low" | "medium" | "high";
export type BuffForecastDecision = "buy" | "hold" | "reduce";

export interface BuffForecastFactor {
  key: "momentum" | "orderBook" | "valveEvent" | "proEvent" | "attentionHeat";
  label: string;
  score: number;
  weight: number;
  contribution: number;
  detail: string;
}

export interface BuffForecastRecommendation {
  decision: BuffForecastDecision;
  title: string;
  summary: string;
  tactics: string[];
}

export interface BuffForecastResult {
  game: BuffGame;
  goodsId: number;
  goodsName: string | null;
  iconUrl: string | null;
  days: number;
  currency: BuffCurrency;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  trend: BuffForecastTrend;
  confidence: number;
  riskLevel: BuffForecastRiskLevel;
  riskScore: number;
  predictedReturnPct: {
    h24: number | null;
    h72: number | null;
  };
  recommendation: BuffForecastRecommendation;
  snapshots: {
    latestPrice: number | null;
    returnH24Pct: number | null;
    returnH72Pct: number | null;
    volatilityPct: number | null;
    spreadPct: number | null;
    depthRatio: number | null;
    transactedNum: number | null;
    valveSignal: number;
    proSignal: number;
    attentionHeatSignal: number;
    coveragePct: number;
  };
  factors: BuffForecastFactor[];
  warnings: string[];
}

export interface FetchBuffForecastInput {
  goodsId: number;
  game?: BuffGame;
  days?: number;
  currency?: BuffCurrency;
  eventLimit?: number;
  timeoutMs?: number;
  requestCookie?: string | null;
  requestCsrfToken?: string | null;
}

interface EventScoreResult {
  signal: number;
  positiveCount: number;
  negativeCount: number;
  recentCount48h: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = avg(values);
  if (mean === null) return null;
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function directionSign(direction: string | null | undefined): number {
  if (direction === "up") return 1;
  if (direction === "down") return -1;
  return 0;
}

function pctReturn(base: number | null, target: number | null): number | null {
  if (base === null || target === null || !Number.isFinite(base) || !Number.isFinite(target) || base <= 0) {
    return null;
  }
  return round(((target - base) / base) * 100, 4);
}

function findNearestPoint(points: BuffSeriesPoint[], targetTs: number, maxGapMs: number): BuffSeriesPoint | null {
  let candidate: BuffSeriesPoint | null = null;
  let minGap = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const gap = Math.abs(point.timestampMs - targetTs);
    if (gap < minGap) {
      minGap = gap;
      candidate = point;
    }
  }

  if (!candidate || minGap > maxGapMs) return null;
  return candidate;
}

function calcReturnsByHours(points: BuffSeriesPoint[], hours: number): number | null {
  if (!points.length) return null;
  const latest = points.at(-1) ?? null;
  if (!latest) return null;
  const back = findNearestPoint(points, latest.timestampMs - hours * 60 * 60 * 1000, Math.max(8, hours) * 60 * 60 * 1000);
  if (!back) return null;
  return pctReturn(back.price, latest.price);
}

function calcVolatility(points: BuffSeriesPoint[]): number | null {
  if (points.length < 8) return null;
  const sample = points.slice(-32);
  const returns: number[] = [];
  for (let idx = 1; idx < sample.length; idx += 1) {
    const prev = sample[idx - 1]?.price ?? null;
    const curr = sample[idx]?.price ?? null;
    const ret = pctReturn(prev, curr);
    if (ret !== null) returns.push(ret);
  }
  const sd = stdDev(returns);
  return sd === null ? null : round(sd, 4);
}

function calcMomentumScore(points: BuffSeriesPoint[]): {
  score: number;
  returnH24Pct: number | null;
  returnH72Pct: number | null;
  volatilityPct: number | null;
} {
  if (!points.length) {
    return {
      score: 0,
      returnH24Pct: null,
      returnH72Pct: null,
      volatilityPct: null,
    };
  }

  const returnH24Pct = calcReturnsByHours(points, 24);
  const returnH72Pct = calcReturnsByHours(points, 72);
  const volatilityPct = calcVolatility(points);

  const recent = points.slice(-24).map((point) => point.price);
  const short = recent.slice(-6);
  const long = recent.slice(-18);
  const shortAvg = avg(short);
  const longAvg = avg(long);
  const maSpreadPct =
    shortAvg !== null && longAvg !== null && longAvg > 0 ? round(((shortAvg - longAvg) / longAvg) * 100, 4) : null;

  const ret24Score = returnH24Pct === null ? 0 : clamp(returnH24Pct / 8, -1, 1);
  const ret72Score = returnH72Pct === null ? 0 : clamp(returnH72Pct / 15, -1, 1);
  const maScore = maSpreadPct === null ? 0 : clamp(maSpreadPct / 6, -1, 1);
  const volPenalty = volatilityPct === null ? 0 : clamp((volatilityPct - 3) / 8, 0, 1);

  const score = clamp(ret24Score * 0.42 + ret72Score * 0.38 + maScore * 0.2 - volPenalty * 0.22, -1, 1);

  return {
    score: round(score, 4),
    returnH24Pct,
    returnH72Pct,
    volatilityPct,
  };
}

function calcOrderBookScore(dashboard: Awaited<ReturnType<typeof fetchBuffGoodsDashboard>>): {
  score: number;
  spreadPct: number | null;
  depthRatio: number | null;
  transactedNum: number | null;
} {
  const info = dashboard.goodsInfo;
  const sellMin = info?.sellMinPrice ?? null;
  const buyMax = info?.buyMaxPrice ?? null;
  const sellNum = info?.sellNum ?? null;
  const buyNum = info?.buyNum ?? null;
  const transactedNum = info?.transactedNum ?? null;

  const spreadPct =
    sellMin !== null && buyMax !== null && sellMin > 0 ? round(((sellMin - buyMax) / sellMin) * 100, 4) : null;
  const depthRatio = sellNum !== null && buyNum !== null && sellNum > 0 ? round(buyNum / sellNum, 4) : null;

  const spreadScore = spreadPct === null ? 0 : clamp((2.5 - spreadPct) / 2.5, -1, 1);
  const depthScore = depthRatio === null ? 0 : clamp((depthRatio - 1) / 0.8, -1, 1);
  const liquidityScore =
    transactedNum === null ? 0 : clamp((Math.log10(transactedNum + 1) - 1.7) / 2, -1, 1);

  const score = clamp(depthScore * 0.55 + spreadScore * 0.3 + liquidityScore * 0.15, -1, 1);
  return {
    score: round(score, 4),
    spreadPct,
    depthRatio,
    transactedNum,
  };
}

function calcValveEventScore(events: ValveImpactEvent[]): EventScoreResult {
  if (!events.length) {
    return {
      signal: 0,
      positiveCount: 0,
      negativeCount: 0,
      recentCount48h: 0,
    };
  }

  let score = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let recentCount48h = 0;

  for (const event of events) {
    const ts = new Date(event.publishedAt).getTime();
    const ageHours = Number.isFinite(ts) ? (Date.now() - ts) / (60 * 60 * 1000) : 0;
    if (ageHours <= 48) recentCount48h += 1;
    const decay = Math.exp(-Math.max(0, ageHours) / 96);
    const ret = event.returnsPct.h24 ?? event.returnsPct.h72 ?? event.returnsPct.h1 ?? 0;
    const fallbackDirection = ret > 0 ? 1 : ret < 0 ? -1 : 0;
    const sign = directionSign(event.direction) || fallbackDirection;
    if (sign > 0) positiveCount += 1;
    if (sign < 0) negativeCount += 1;
    const retMagnitude = clamp(Math.abs(ret) / 8, 0, 2.5);
    const impactMagnitude = clamp((event.impactScore ?? 1) / 3, 0, 3);
    score += sign * (retMagnitude * 0.55 + impactMagnitude * 0.45) * decay;
  }

  return {
    signal: round(clamp(Math.tanh(score / 3), -1, 1), 4),
    positiveCount,
    negativeCount,
    recentCount48h,
  };
}

function calcProEventScore(events: ProImpactEvent[]): EventScoreResult {
  if (!events.length) {
    return {
      signal: 0,
      positiveCount: 0,
      negativeCount: 0,
      recentCount48h: 0,
    };
  }

  let score = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let recentCount48h = 0;

  for (const event of events) {
    const ts = new Date(event.publishedAt).getTime();
    const ageHours = Number.isFinite(ts) ? (Date.now() - ts) / (60 * 60 * 1000) : 0;
    if (ageHours <= 48) recentCount48h += 1;
    const decay = Math.exp(-Math.max(0, ageHours) / 84);
    const ret = event.returnsPct.h24 ?? event.returnsPct.h72 ?? event.returnsPct.h1 ?? 0;
    const fallbackDirection = ret > 0 ? 1 : ret < 0 ? -1 : 0;
    const sign = directionSign(event.direction) || fallbackDirection;
    if (sign > 0) positiveCount += 1;
    if (sign < 0) negativeCount += 1;
    const retMagnitude = clamp(Math.abs(ret) / 8, 0, 2.5);
    const impactMagnitude = clamp((event.impactScore ?? 1) / 2.8, 0, 3);
    const relevance = clamp(event.relevanceScore ?? 0, 0, 1);
    score += sign * (retMagnitude * 0.45 + impactMagnitude * 0.35 + relevance * 0.2) * decay;
  }

  return {
    signal: round(clamp(Math.tanh(score / 3), -1, 1), 4),
    positiveCount,
    negativeCount,
    recentCount48h,
  };
}

function calcAttentionHeatSignal(args: {
  valve: EventScoreResult;
  pro: EventScoreResult;
}): {
  score: number;
  rawHeat: number;
  hypeRisk: number;
} {
  const rawHeat = args.valve.recentCount48h * 0.9 + args.pro.recentCount48h * 1.2;
  const heatLevel = clamp(rawHeat / 12, 0, 1);
  const directionalBias = clamp((args.valve.signal + args.pro.signal) / 2, -1, 1);
  const score = round(clamp(heatLevel * directionalBias, -1, 1), 4);
  const hypeRisk = clamp((heatLevel - 0.45) / 0.55, 0, 1);
  return {
    score,
    rawHeat: round(rawHeat, 4),
    hypeRisk: round(hypeRisk, 4),
  };
}

function calcRiskScore(args: {
  volatilityPct: number | null;
  spreadPct: number | null;
  transactedNum: number | null;
  valveSignal: number;
  proSignal: number;
  hypeRisk: number;
}): number {
  const volRisk = args.volatilityPct === null ? 0.45 : clamp(args.volatilityPct / 7, 0, 1);
  const spreadRisk = args.spreadPct === null ? 0.5 : clamp(args.spreadPct / 4, 0, 1);
  const liquidityRisk =
    args.transactedNum === null ? 0.55 : clamp((80 - args.transactedNum) / 80, 0, 1);
  const conflictRisk = args.valveSignal * args.proSignal < 0 ? clamp(Math.abs(args.valveSignal - args.proSignal), 0, 1) : 0;

  return round(
    clamp(volRisk * 0.34 + spreadRisk * 0.26 + liquidityRisk * 0.2 + conflictRisk * 0.1 + args.hypeRisk * 0.1, 0, 1),
    4,
  );
}

function riskLevelFromScore(score: number): BuffForecastRiskLevel {
  if (score >= 0.65) return "high";
  if (score >= 0.35) return "medium";
  return "low";
}

function trendFromSignal(signal: number): BuffForecastTrend {
  if (signal >= 0.18) return "bullish";
  if (signal <= -0.18) return "bearish";
  return "sideways";
}

function buildRecommendation(args: {
  trend: BuffForecastTrend;
  confidence: number;
  riskLevel: BuffForecastRiskLevel;
  predictedH24: number | null;
  predictedH72: number | null;
  spreadPct: number | null;
}): BuffForecastRecommendation {
  const spreadHint =
    args.spreadPct === null ? "盘口价差未知" : `当前价差约 ${Math.max(0, args.spreadPct).toFixed(2)}%`;

  if (args.trend === "bullish") {
    if (args.riskLevel === "high") {
      return {
        decision: "hold",
        title: "偏多但波动偏高",
        summary: `预测 24h ${args.predictedH24?.toFixed(2) ?? "N/A"}%，72h ${args.predictedH72?.toFixed(2) ?? "N/A"}%。建议轻仓试探，避免追高。`,
        tactics: [
          "仅在回调到近24h均值附近分批买入",
          "单次仓位不超过计划仓位的 30%",
          "若24h内跌破入场价 3%-5% 则止损离场",
        ],
      };
    }
    return {
      decision: "buy",
      title: args.confidence >= 70 ? "短中期偏多" : "轻度偏多",
      summary: `预测 24h ${args.predictedH24?.toFixed(2) ?? "N/A"}%，72h ${args.predictedH72?.toFixed(2) ?? "N/A"}%。${spreadHint}。`,
      tactics: [
        "优先分批挂单，不追涨",
        "重点观察 Valve / 职业事件是否延续",
        "若72h走势未兑现，降低仓位并复盘因子变化",
      ],
    };
  }

  if (args.trend === "bearish") {
    return {
      decision: "reduce",
      title: args.confidence >= 70 ? "短中期偏空" : "轻度偏空",
      summary: `预测 24h ${args.predictedH24?.toFixed(2) ?? "N/A"}%，72h ${args.predictedH72?.toFixed(2) ?? "N/A"}%。建议回避追高，已有仓位优先减仓。`,
      tactics: [
        "已有浮盈仓位分批止盈，降低回撤",
        "等待价差收敛与事件冲击衰减后再评估",
        "若出现强正向新事件，再考虑反转策略",
      ],
    };
  }

  return {
    decision: "hold",
    title: "震荡格局",
    summary: `预测 24h ${args.predictedH24?.toFixed(2) ?? "N/A"}%，72h ${args.predictedH72?.toFixed(2) ?? "N/A"}%。当前方向性不足，建议以观望为主。`,
    tactics: [
      "仅做小仓位区间交易",
      "等待突破并确认成交放量后再跟随",
      "持续跟踪补丁与职业事件新催化",
    ],
  };
}

function dedupeWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.filter((item) => item.trim().length > 0))];
}

export async function fetchBuffForecast(input: FetchBuffForecastInput): Promise<BuffForecastResult> {
  const goodsId = input.goodsId;
  const game = input.game ?? "csgo";
  const days = clamp(Math.floor(input.days ?? 30), 1, 120);
  const currency = input.currency ?? "CNY";
  const eventLimit = clamp(Math.floor(input.eventLimit ?? 16), 4, 40);

  const [dashboard, valveImpact, proImpact] = await Promise.all([
    fetchBuffGoodsDashboard({
      goodsId,
      game,
      days,
      currency,
      ordersPageNum: 1,
      timeoutMs: input.timeoutMs,
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
    }),
    fetchValveImpactForGoods({
      goodsId,
      game,
      days,
      currency,
      eventLimit,
      timeoutMs: input.timeoutMs,
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
    }),
    fetchProImpactForGoods({
      goodsId,
      game,
      days,
      currency,
      eventLimit,
      timeoutMs: input.timeoutMs,
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
    }),
  ]);

  const points = [...(dashboard.priceHistory?.primarySeries?.points ?? [])].sort(
    (left, right) => left.timestampMs - right.timestampMs,
  );
  const latestPrice = points.at(-1)?.price ?? null;

  const momentum = calcMomentumScore(points);
  const orderBook = calcOrderBookScore(dashboard);
  const valveScore = calcValveEventScore(valveImpact.events);
  const proScore = calcProEventScore(proImpact.events);
  const heat = calcAttentionHeatSignal({ valve: valveScore, pro: proScore });

  const riskScore = calcRiskScore({
    volatilityPct: momentum.volatilityPct,
    spreadPct: orderBook.spreadPct,
    transactedNum: orderBook.transactedNum,
    valveSignal: valveScore.signal,
    proSignal: proScore.signal,
    hypeRisk: heat.hypeRisk,
  });

  const weights = {
    momentum: 0.36,
    orderBook: 0.22,
    valveEvent: 0.18,
    proEvent: 0.16,
    attentionHeat: 0.08,
  } as const;

  const rawSignal =
    momentum.score * weights.momentum +
    orderBook.score * weights.orderBook +
    valveScore.signal * weights.valveEvent +
    proScore.signal * weights.proEvent +
    heat.score * weights.attentionHeat;

  const finalSignal = round(clamp(rawSignal * (1 - riskScore * 0.3), -1, 1), 4);
  const trend = trendFromSignal(finalSignal);
  const riskLevel = riskLevelFromScore(riskScore);

  const availableSignals = [
    points.length >= 8,
    orderBook.spreadPct !== null || orderBook.depthRatio !== null,
    valveImpact.events.length > 0,
    proImpact.events.length > 0,
  ].filter(Boolean).length;
  const coveragePct = round((availableSignals / 4) * 100, 2);

  const confidenceBase = 35 + Math.abs(finalSignal) * 45 + (coveragePct / 100) * 20 - riskScore * 12;
  const confidence = Math.round(clamp(confidenceBase, points.length ? 10 : 5, 95));

  const volatilityAmp = clamp((momentum.volatilityPct ?? 2.5) / 2, 0.6, 3.5);
  const predictedH24 = points.length
    ? round(clamp(finalSignal * (4 + volatilityAmp * 1.2), -18, 18), 3)
    : null;
  const predictedH72 = points.length
    ? round(clamp(finalSignal * (8 + volatilityAmp * 2.1), -30, 30), 3)
    : null;

  const recommendation = buildRecommendation({
    trend,
    confidence,
    riskLevel,
    predictedH24,
    predictedH72,
    spreadPct: orderBook.spreadPct,
  });

  const factors: BuffForecastFactor[] = [
    {
      key: "momentum",
      label: "价格动量",
      score: momentum.score,
      weight: weights.momentum,
      contribution: round(momentum.score * weights.momentum, 4),
      detail: `24h=${momentum.returnH24Pct === null ? "N/A" : `${momentum.returnH24Pct.toFixed(2)}%`} / 72h=${
        momentum.returnH72Pct === null ? "N/A" : `${momentum.returnH72Pct.toFixed(2)}%`
      }`,
    },
    {
      key: "orderBook",
      label: "盘口与流动性",
      score: orderBook.score,
      weight: weights.orderBook,
      contribution: round(orderBook.score * weights.orderBook, 4),
      detail: `spread=${orderBook.spreadPct === null ? "N/A" : `${orderBook.spreadPct.toFixed(2)}%`} / depth=${
        orderBook.depthRatio === null ? "N/A" : orderBook.depthRatio.toFixed(2)
      }`,
    },
    {
      key: "valveEvent",
      label: "V 社事件冲击",
      score: valveScore.signal,
      weight: weights.valveEvent,
      contribution: round(valveScore.signal * weights.valveEvent, 4),
      detail: `近48h事件=${valveScore.recentCount48h}，正/负=${valveScore.positiveCount}/${valveScore.negativeCount}`,
    },
    {
      key: "proEvent",
      label: "职业事件冲击",
      score: proScore.signal,
      weight: weights.proEvent,
      contribution: round(proScore.signal * weights.proEvent, 4),
      detail: `近48h事件=${proScore.recentCount48h}，正/负=${proScore.positiveCount}/${proScore.negativeCount}`,
    },
    {
      key: "attentionHeat",
      label: "热度代理",
      score: heat.score,
      weight: weights.attentionHeat,
      contribution: round(heat.score * weights.attentionHeat, 4),
      detail: `事件热度=${heat.rawHeat.toFixed(2)}，hypeRisk=${heat.hypeRisk.toFixed(2)}`,
    },
  ];

  const goodsName =
    dashboard.goodsInfo?.name ??
    dashboard.goodsInfo?.shortName ??
    dashboard.goodsInfo?.marketHashName ??
    proImpact.goodsName ??
    null;

  const warnings = dedupeWarnings([
    ...dashboard.warnings,
    ...valveImpact.warnings,
    ...proImpact.warnings,
    ...(points.length < 8 ? ["价格序列点位偏少，预测稳定性受限。"] : []),
    ...(coveragePct < 50 ? ["可用因子覆盖不足 50%，建议补充有效 Cookie 后再评估。"] : []),
  ]);

  return {
    game,
    goodsId,
    goodsName,
    iconUrl: dashboard.goodsInfo?.iconUrl ?? null,
    days,
    currency,
    fetchedAt: new Date().toISOString(),
    auth: dashboard.auth,
    trend,
    confidence,
    riskLevel,
    riskScore,
    predictedReturnPct: {
      h24: predictedH24,
      h72: predictedH72,
    },
    recommendation,
    snapshots: {
      latestPrice,
      returnH24Pct: momentum.returnH24Pct,
      returnH72Pct: momentum.returnH72Pct,
      volatilityPct: momentum.volatilityPct,
      spreadPct: orderBook.spreadPct,
      depthRatio: orderBook.depthRatio,
      transactedNum: orderBook.transactedNum,
      valveSignal: valveScore.signal,
      proSignal: proScore.signal,
      attentionHeatSignal: heat.score,
      coveragePct,
    },
    factors,
    warnings,
  };
}
