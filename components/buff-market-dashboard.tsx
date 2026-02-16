"use client";
/* eslint-disable @next/next/no-img-element */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PriceChart = dynamic(
  () => import("@/components/price-chart").then((module) => module.PriceChart),
  { ssr: false },
);

const NO_CACHE_HEADERS: HeadersInit = {
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

const BUFF_FAVORITES_STORAGE_KEY = "buff_cs2_market_favorites_v1";
const BUFF_FAVORITES_LIMIT = 300;

type BuffAuthSource = "request" | "env" | "none";
type BuffMarketTab = "selling" | "buying" | "bundle" | "all";

type BuffSeriesPoint = {
  timestampMs: number;
  at: string;
  price: number;
};

type BuffPriceLineSummary = {
  key: string;
  name: string;
  chartType: string;
  color: string | null;
  allow: boolean;
  show: boolean;
  pointCount: number;
  firstAt: string | null;
  latestAt: string | null;
  firstPrice: number | null;
  latestPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  changePct: number | null;
  isGated: boolean;
  gateMessage: string | null;
};

type BuffPriceHistoryResult = {
  game: "csgo";
  goodsId: number;
  days: number;
  currency: "CNY" | "USD";
  currencyLabel: string;
  currencySymbol: string;
  priceType: string;
  endpoint: string;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  lines: BuffPriceLineSummary[];
  primaryLineKey: string | null;
  primarySeries: {
    key: string;
    name: string;
    points: BuffSeriesPoint[];
  } | null;
  warnings: string[];
};

type BuffHistoryDayOption = {
  days: number;
  text: string;
  disabled: boolean;
  gateMessage: string | null;
};

type BuffHistoryDaysResult = {
  source: "buff" | "steam";
  options: BuffHistoryDayOption[];
};

type BuffMarketListItem = {
  goodsId: number;
  name: string | null;
  shortName: string | null;
  marketHashName: string | null;
  iconUrl: string | null;
  sellMinPrice: number | null;
  buyMaxPrice: number | null;
  sellNum: number | null;
  buyNum: number | null;
  transactedNum: number | null;
  steamPriceCny: number | null;
  hasBuffPriceHistory: boolean;
};

type BuffFavoriteItem = {
  goodsId: number;
  name: string | null;
  shortName: string | null;
  marketHashName: string | null;
  iconUrl: string | null;
  savedAt: string;
};

type BuffMarketListResult = {
  game: "csgo";
  tab: BuffMarketTab;
  pageNum: number;
  pageSize: number;
  totalPage: number;
  totalCount: number;
  endpoint: string;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  items: BuffMarketListItem[];
  warnings: string[];
};

type BuffOrderItem = {
  id: string;
  userId: string | null;
  price: number | null;
  num: number | null;
  stateText: string | null;
  payMethodText: string | null;
  iconUrl: string | null;
  paintwear: number | null;
  tradableCooldownText: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type BuffOrderListResult = {
  kind: "sell" | "buy" | "bill";
  totalCount: number;
  items: BuffOrderItem[];
};

type BuffGoodsInfoSummary = {
  goodsId: number;
  name: string | null;
  shortName: string | null;
  marketHashName: string | null;
  iconUrl: string | null;
  sellMinPrice: number | null;
  buyMaxPrice: number | null;
  sellNum: number | null;
  buyNum: number | null;
  transactedNum: number | null;
  hasBuffPriceHistory: boolean;
};

type BuffGoodsTab = {
  id: number;
  name: string;
  text: string;
};

type BuffGoodsTabsResult = {
  tabs: BuffGoodsTab[];
  goodsTabIds: number[];
};

type BuffEndpointStatus = {
  key:
  | "goodsInfo"
  | "goodsTabs"
  | "priceHistory"
  | "historyDaysBuff"
  | "historyDaysSteam"
  | "sellOrders"
  | "buyOrders"
  | "billOrders";
  endpoint: string;
  ok: boolean;
  code: string;
  error: string | null;
};

type BuffGoodsDashboardResult = {
  game: "csgo";
  goodsId: number;
  days: number;
  currency: "CNY" | "USD";
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  goodsInfo: BuffGoodsInfoSummary | null;
  goodsTabs: BuffGoodsTabsResult | null;
  priceHistory: BuffPriceHistoryResult | null;
  historyDaysBuff: BuffHistoryDaysResult | null;
  historyDaysSteam: BuffHistoryDaysResult | null;
  sellOrders: BuffOrderListResult | null;
  buyOrders: BuffOrderListResult | null;
  billOrders: BuffOrderListResult | null;
  endpointStatus: BuffEndpointStatus[];
  warnings: string[];
};

type BuffMarketApiResponse = {
  ok?: boolean;
  result?: BuffMarketListResult;
  error?: string;
};

type BuffGoodsApiResponse = {
  ok?: boolean;
  result?: BuffGoodsDashboardResult;
  error?: string;
};

type BuffFavoritesEndpointStatus = {
  goodsId: number;
  endpoint: string;
  ok: boolean;
  code: string;
  error: string | null;
};

type BuffFavoritesLookupResult = {
  game: "csgo";
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  requestedCount: number;
  successCount: number;
  failedGoodsIds: number[];
  items: BuffMarketListItem[];
  endpointStatus: BuffFavoritesEndpointStatus[];
  warnings: string[];
};

type BuffFavoritesLookupApiResponse = {
  ok?: boolean;
  result?: BuffFavoritesLookupResult;
  error?: string;
};

type BuffForecastTrend = "bullish" | "bearish" | "sideways";
type BuffForecastRiskLevel = "low" | "medium" | "high";
type BuffForecastDecision = "buy" | "hold" | "reduce";

type BuffForecastFactor = {
  key: "momentum" | "orderBook" | "valveEvent" | "proEvent" | "attentionHeat" | "llmEventIntel";
  label: string;
  score: number;
  weight: number;
  contribution: number;
  detail: string;
};

type BuffForecastRecommendation = {
  decision: BuffForecastDecision;
  title: string;
  summary: string;
  tactics: string[];
};

type BuffForecastResult = {
  game: "csgo";
  goodsId: number;
  goodsName: string | null;
  iconUrl: string | null;
  days: number;
  currency: "CNY" | "USD";
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
  llm: {
    enabled: boolean;
    status: "ok" | "skipped" | "error";
    model: string | null;
    promptVersion: string;
    sourceCount: number;
    analyzedCount: number;
    aggregate: {
      signal: number;
      hypeRisk: number;
      conflictRisk: number;
      reliability: number;
      relevance: number;
      coveragePct: number;
    };
    narrative: {
      summary: string;
      rationale: string[];
      risks: string[];
      advice: string[];
    } | null;
    eventInsights: Array<{
      refId: string;
      provider: "valve" | "pro";
      publishedAt: string;
      topic: string;
      eventType:
        | "valve_patch"
        | "valve_economy"
        | "pro_preference"
        | "pro_retirement"
        | "pro_roster"
        | "social_hype"
        | "rumor"
        | "other";
      direction: "up" | "down" | "neutral" | "mixed" | "unknown";
      confidence: number;
      relevance: number;
      hypeScore: number;
      reliability: number;
      horizonHours: number;
      duplicateOf: string | null;
      conflictsWith: string[];
      evidence: string[];
      reason: string;
    }>;
    warning: string | null;
  };
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
    llmSignal: number;
    llmHypeRisk: number;
    llmConflictRisk: number;
    llmReliability: number;
    coveragePct: number;
  };
  factors: BuffForecastFactor[];
  warnings: string[];
};

type BuffForecastApiResponse = {
  ok?: boolean;
  result?: BuffForecastResult;
  error?: string;
};

type ValveUpdateCategory = "economy" | "maps" | "gameplay" | "competitive" | "anti-cheat" | "misc";
type ValveUpdateSeverity = "high" | "medium" | "low";
type ValveImpactDirection = "up" | "down" | "flat" | "insufficient";

type ValveSourceStatus = {
  source: "steam-api" | "steam-rss";
  endpoint: string;
  ok: boolean;
  itemCount: number;
  error: string | null;
};

type ValveOfficialUpdate = {
  id: string;
  title: string;
  url: string | null;
  author: string | null;
  publishedAt: string;
  tags: string[];
  categories: ValveUpdateCategory[];
  sections: string[];
  severity: ValveUpdateSeverity;
  summary: string;
  feedLabel: string | null;
  feedName: string | null;
};

type ValveUpdatesResult = {
  appId: number;
  game: "csgo";
  fetchedAt: string;
  sourceStatus: ValveSourceStatus[];
  updates: ValveOfficialUpdate[];
  warnings: string[];
};

type ValveImpactEvent = {
  id: string;
  title: string;
  url: string | null;
  publishedAt: string;
  categories: ValveUpdateCategory[];
  severity: ValveUpdateSeverity;
  tags: string[];
  summary: string;
  baselinePrice: number | null;
  baselineAt: string | null;
  returnsPct: {
    h1: number | null;
    h24: number | null;
    h72: number | null;
  };
  sampledAt: {
    h1: string | null;
    h24: string | null;
    h72: string | null;
  };
  direction: ValveImpactDirection;
  impactScore: number | null;
};

type ValveImpactResult = {
  game: "csgo";
  goodsId: number;
  days: number;
  currency: "CNY" | "USD";
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  priceType: string;
  pricePointCount: number;
  sourceStatus: ValveSourceStatus[];
  events: ValveImpactEvent[];
  warnings: string[];
};

type ValveUpdatesApiResponse = {
  ok?: boolean;
  result?: ValveUpdatesResult;
  error?: string;
};

type ValveImpactApiResponse = {
  ok?: boolean;
  result?: ValveImpactResult;
  error?: string;
};

type ProEventType = "retirement" | "roster_move" | "preference" | "other";
type ProEventSeverity = "high" | "medium" | "low";
type ProPlayerStatus = "active" | "retired" | "unknown";
type ProImpactDirection = "up" | "down" | "flat" | "insufficient";

type ProSourceStatus = {
  source: "hltv-rss" | "liquipedia-api";
  endpoint: string;
  ok: boolean;
  itemCount: number;
  error: string | null;
};

type ProEventPlayer = {
  name: string;
  status: ProPlayerStatus;
  pageTitle: string | null;
};

type ProPlayerEvent = {
  id: string;
  title: string;
  summary: string;
  url: string | null;
  publishedAt: string;
  eventType: ProEventType;
  severity: ProEventSeverity;
  players: ProEventPlayer[];
  keywords: string[];
};

type ProPlayerEventsResult = {
  game: "csgo";
  fetchedAt: string;
  sourceStatus: ProSourceStatus[];
  events: ProPlayerEvent[];
  warnings: string[];
};

type ProImpactEvent = {
  id: string;
  title: string;
  url: string | null;
  publishedAt: string;
  eventType: ProEventType;
  severity: ProEventSeverity;
  players: ProEventPlayer[];
  keywords: string[];
  summary: string;
  relevanceScore: number;
  baselinePrice: number | null;
  baselineAt: string | null;
  returnsPct: {
    h1: number | null;
    h24: number | null;
    h72: number | null;
  };
  sampledAt: {
    h1: string | null;
    h24: string | null;
    h72: string | null;
  };
  direction: ProImpactDirection;
  impactScore: number | null;
};

type ProImpactResult = {
  game: "csgo";
  goodsId: number;
  goodsName: string | null;
  days: number;
  currency: "CNY" | "USD";
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  priceType: string;
  pricePointCount: number;
  sourceStatus: ProSourceStatus[];
  events: ProImpactEvent[];
  warnings: string[];
};

type ProEventsApiResponse = {
  ok?: boolean;
  result?: ProPlayerEventsResult;
  error?: string;
};

type ProImpactApiResponse = {
  ok?: boolean;
  result?: ProImpactResult;
  error?: string;
};

type IntelProvider = "valve" | "pro";

type IntelRunState = {
  jobKey: string;
  lastRanAt: string | null;
  lastStatus: "idle" | "success" | "failed";
  lastMessage: string | null;
  updatedAt: string;
};

type IntelImpactRecord = {
  id: number;
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
  createdAt: string;
  updatedAt: string;
};

type IntelEventRecord = {
  id: number;
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
  createdAt: string;
  updatedAt: string;
};

type IntelEvaluationProviderMetrics = {
  provider: IntelProvider;
  sampleCount: number;
  upRatePct: number | null;
  avgReturnH24Pct: number | null;
  avgAbsReturnH24Pct: number | null;
  avgImpactScore: number | null;
  avgRelevanceScore: number | null;
  impactReturnCorrelation: number | null;
};

type IntelEvaluationReport = {
  generatedAt: string;
  lookbackDays: number;
  goodsId: number | null;
  metrics: IntelEvaluationProviderMetrics[];
  topImpacts: IntelImpactRecord[];
  recentEvents: IntelEventRecord[];
  runState: IntelRunState[];
};

type IntelAlertItem = {
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
};

type IntelAlertsReport = {
  generatedAt: string;
  lookbackHours: number;
  thresholds: {
    impactScore: number;
    return24AbsPct: number;
    relevanceScore: number;
  };
  alerts: IntelAlertItem[];
};

type IntelEvaluationApiResponse = {
  ok?: boolean;
  result?: {
    storage: "vercel_postgres" | "local";
    report: IntelEvaluationReport;
  };
  error?: string;
};

type IntelAlertsApiResponse = {
  ok?: boolean;
  result?: {
    storage: "vercel_postgres" | "local";
    report: IntelAlertsReport;
  };
  error?: string;
};

type SourceBlueprint = {
  title: string;
  freshness: string;
  method: string;
  signal: string;
  risk: string;
};

type FactorMapItem = {
  factor: string;
  source: string;
  metric: string;
  frequency: string;
  priority: "P0" | "P1" | "P2";
};

type QuickJumpTarget = {
  id: string;
  label: string;
};

const SOURCE_BLUEPRINT: SourceBlueprint[] = [
  {
    title: "BUFF 官方价格接口",
    freshness: "分钟级",
    method: "接入 goods/info + sell_order + buy_order + bill_order + price_history 全套接口，组合成同一件商品的完整快照。",
    signal: "在售最低、求购最高、挂单深度、成交明细、价格曲线、可选历史窗口。",
    risk: "价格曲线和成交接口依赖登录态；会员权益会限制部分字段。",
  },
  {
    title: "V 社官方变更",
    freshness: "事件驱动",
    method: "拉取 Counter-Strike 官方公告 / Steam 新闻流，抽取补丁生效时间与皮肤供给变化。",
    signal: "补丁发布日期、掉落池改动、可获取性变化。",
    risk: "公告文本是非结构化，需要规则或 LLM 标签化。",
  },
  {
    title: "职业选手偏好与退役事件",
    freshness: "小时级",
    method: "抓取 HLTV / Liquipedia / 战队社媒，做选手-皮肤共现跟踪。",
    signal: "选手曝光强度、退役/转会事件冲击。",
    risk: "来源分散且有反爬策略，需要缓存与限流。",
  },
  {
    title: "社交媒体热度与炒作",
    freshness: "5-30 分钟",
    method: "采集 Reddit、微博、B站、抖音关键词热度，构建跨平台 hype 指数。",
    signal: "提及量、互动量、情绪偏移、异常增速。",
    risk: "噪声和机器人干扰高，需去重与异常检测。",
  },
];

const FACTOR_MAP: FactorMapItem[] = [
  {
    factor: "补丁与掉落机制",
    source: "Steam 公告 + BUFF price_history",
    metric: "事件后 1h / 24h 涨跌幅、成交密度",
    frequency: "5 分钟轮询 + 事件触发",
    priority: "P0",
  },
  {
    factor: "流动性变化",
    source: "BUFF sell_order / buy_order / bill_order",
    metric: "价差、深度、短时波动率",
    frequency: "5 分钟",
    priority: "P0",
  },
  {
    factor: "职业选手偏好",
    source: "HLTV/Liquipedia + 战队社媒",
    metric: "皮肤曝光共现次数",
    frequency: "每小时",
    priority: "P1",
  },
  {
    factor: "社媒炒作热度",
    source: "Reddit/微博/B站/抖音",
    metric: "提及量 z-score、情绪漂移",
    frequency: "10-30 分钟",
    priority: "P1",
  },
  {
    factor: "平台权益限制",
    source: "price_history days/options",
    metric: "受限天数与受限曲线占比",
    frequency: "每日巡检",
    priority: "P2",
  },
];

function fmtTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function fmtPrice(value: number | null, currencySymbol = "¥"): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `${currencySymbol}${value.toFixed(2)}`;
}

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

function fmtCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return value.toLocaleString("zh-CN");
}

function authSourceText(source: BuffAuthSource): string {
  if (source === "request") return "来自本次输入";
  if (source === "env") return "来自服务端环境变量";
  return "未提供";
}

function endpointStatusClass(item: BuffEndpointStatus): string {
  return `buff-endpoint-item${item.ok ? " is-ok" : " is-fail"}`;
}

function lineCardClass(line: BuffPriceLineSummary): string {
  return `buff-line-item${line.isGated ? " is-gated" : ""}`;
}

function marketItemClass(selected: boolean): string {
  return `buff-market-item${selected ? " is-active" : ""}`;
}

function marketFavoriteButtonClass(active: boolean): string {
  return `buff-market-fav-button${active ? " is-active" : ""}`;
}

function mergeMarketItems(current: BuffMarketListItem[], incoming: BuffMarketListItem[]): BuffMarketListItem[] {
  const merged = [...current];
  const existingGoodsIds = new Set(current.map((item) => item.goodsId));
  for (const item of incoming) {
    if (existingGoodsIds.has(item.goodsId)) continue;
    merged.push(item);
    existingGoodsIds.add(item.goodsId);
  }
  return merged;
}

function normalizeFavoriteItems(input: unknown): BuffFavoriteItem[] {
  if (!Array.isArray(input)) return [];
  const normalized: BuffFavoriteItem[] = [];
  const seen = new Set<number>();

  for (const value of input) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as Partial<BuffFavoriteItem>;
    const goodsId = Number(candidate.goodsId);
    if (!Number.isInteger(goodsId) || goodsId <= 0 || seen.has(goodsId)) continue;
    seen.add(goodsId);
    normalized.push({
      goodsId,
      name: typeof candidate.name === "string" ? candidate.name : null,
      shortName: typeof candidate.shortName === "string" ? candidate.shortName : null,
      marketHashName: typeof candidate.marketHashName === "string" ? candidate.marketHashName : null,
      iconUrl: typeof candidate.iconUrl === "string" ? candidate.iconUrl : null,
      savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : new Date().toISOString(),
    });
    if (normalized.length >= BUFF_FAVORITES_LIMIT) break;
  }

  return normalized;
}

function marketItemDisplayName(item: {
  goodsId: number;
  name: string | null;
  shortName: string | null;
  marketHashName: string | null;
}): string {
  return item.name ?? item.shortName ?? item.marketHashName ?? `goods_id ${item.goodsId}`;
}

function favoriteToMarketListItem(item: BuffFavoriteItem): BuffMarketListItem {
  return {
    goodsId: item.goodsId,
    name: item.name,
    shortName: item.shortName,
    marketHashName: item.marketHashName,
    iconUrl: item.iconUrl,
    sellMinPrice: null,
    buyMaxPrice: null,
    sellNum: null,
    buyNum: null,
    transactedNum: null,
    steamPriceCny: null,
    hasBuffPriceHistory: false,
  };
}

function orderTitle(kind: BuffOrderListResult["kind"]): string {
  if (kind === "sell") return "在售挂单";
  if (kind === "buy") return "求购挂单";
  return "成交记录";
}

function tabLabel(tab: BuffMarketTab): string {
  if (tab === "selling") return "在售";
  if (tab === "buying") return "求购";
  if (tab === "bundle") return "组合包";
  return "全量搜索";
}

function fmtSignedPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function valveCategoryText(category: ValveUpdateCategory): string {
  if (category === "economy") return "经济/供给";
  if (category === "maps") return "地图";
  if (category === "gameplay") return "玩法";
  if (category === "competitive") return "竞技生态";
  if (category === "anti-cheat") return "反作弊";
  return "杂项修复";
}

function valveSeverityText(severity: ValveUpdateSeverity): string {
  if (severity === "high") return "高";
  if (severity === "medium") return "中";
  return "低";
}

function valveDirectionText(direction: ValveImpactDirection): string {
  if (direction === "up") return "上行";
  if (direction === "down") return "下行";
  if (direction === "flat") return "震荡";
  return "样本不足";
}

function valveSeverityClass(severity: ValveUpdateSeverity): string {
  return `buff-valve-item is-${severity}`;
}

function valveDirectionClass(direction: ValveImpactDirection): string {
  return `buff-impact-direction is-${direction}`;
}

function proEventTypeText(type: ProEventType): string {
  if (type === "retirement") return "退役/停赛";
  if (type === "roster_move") return "转会/替补";
  if (type === "preference") return "偏好信号";
  return "其他";
}

function proSeverityText(severity: ProEventSeverity): string {
  if (severity === "high") return "高";
  if (severity === "medium") return "中";
  return "低";
}

function proPlayerStatusText(status: ProPlayerStatus): string {
  if (status === "retired") return "已退役";
  if (status === "active") return "活跃";
  return "未知";
}

function proDirectionText(direction: ProImpactDirection): string {
  if (direction === "up") return "上行";
  if (direction === "down") return "下行";
  if (direction === "flat") return "震荡";
  return "样本不足";
}

function proSeverityClass(severity: ProEventSeverity): string {
  return `buff-pro-item is-${severity}`;
}

function proDirectionClass(direction: ProImpactDirection): string {
  return `buff-impact-direction is-${direction}`;
}

function forecastTrendText(trend: BuffForecastTrend): string {
  if (trend === "bullish") return "看涨";
  if (trend === "bearish") return "看跌";
  return "震荡";
}

function forecastTrendClass(trend: BuffForecastTrend): string {
  return `buff-forecast-badge is-${trend}`;
}

function forecastRiskText(risk: BuffForecastRiskLevel): string {
  if (risk === "low") return "低风险";
  if (risk === "high") return "高风险";
  return "中风险";
}

function forecastRiskClass(risk: BuffForecastRiskLevel): string {
  return `buff-forecast-badge risk-${risk}`;
}

function forecastDecisionText(decision: BuffForecastDecision): string {
  if (decision === "buy") return "建议分批买入";
  if (decision === "reduce") return "建议减仓/回避";
  return "建议观望";
}

function llmStatusText(status: BuffForecastResult["llm"]["status"]): string {
  if (status === "ok") return "已启用";
  if (status === "skipped") return "已跳过";
  return "降级";
}

function llmStatusClass(status: BuffForecastResult["llm"]["status"]): string {
  return `buff-forecast-badge llm-${status}`;
}

function llmDirectionText(direction: BuffForecastResult["llm"]["eventInsights"][number]["direction"]): string {
  if (direction === "up") return "上行";
  if (direction === "down") return "下行";
  if (direction === "mixed") return "分化";
  if (direction === "neutral") return "中性";
  return "未知";
}

function llmDirectionClass(direction: BuffForecastResult["llm"]["eventInsights"][number]["direction"]): string {
  if (direction === "up") return "buff-impact-direction is-up";
  if (direction === "down") return "buff-impact-direction is-down";
  if (direction === "mixed" || direction === "neutral") return "buff-impact-direction is-flat";
  return "buff-impact-direction is-insufficient";
}

function llmProviderText(provider: BuffForecastResult["llm"]["eventInsights"][number]["provider"]): string {
  return provider === "valve" ? "Valve" : "Pro";
}

function llmEventTypeText(type: BuffForecastResult["llm"]["eventInsights"][number]["eventType"]): string {
  if (type === "valve_patch") return "补丁";
  if (type === "valve_economy") return "经济更新";
  if (type === "pro_preference") return "选手偏好";
  if (type === "pro_retirement") return "退役事件";
  if (type === "pro_roster") return "阵容变更";
  if (type === "social_hype") return "社媒热度";
  if (type === "rumor") return "传闻";
  return "其他";
}

function intelProviderText(provider: IntelProvider): string {
  return provider === "valve" ? "Valve 官方" : "职业事件";
}

function intelRunStatusText(status: IntelRunState["lastStatus"]): string {
  if (status === "success") return "成功";
  if (status === "failed") return "失败";
  return "空闲";
}

function intelAlertSeverityText(severity: IntelAlertItem["severity"]): string {
  return severity === "high" ? "高" : "中";
}

function intelAlertSeverityClass(severity: IntelAlertItem["severity"]): string {
  return `buff-alert-pill is-${severity}`;
}

function intelDirectionClass(direction: string | null): string {
  if (direction === "up" || direction === "down" || direction === "flat" || direction === "insufficient") {
    return `buff-impact-direction is-${direction}`;
  }
  return "buff-impact-direction is-insufficient";
}

function intelDirectionText(direction: string | null): string {
  if (direction === "up") return "上行";
  if (direction === "down") return "下行";
  if (direction === "flat") return "震荡";
  return "样本不足";
}

function loadingCardClassName(baseClassName: string, loading: boolean): string {
  return loading ? `${baseClassName} is-loading-card` : baseClassName;
}

function renderCardLoading(loading: boolean, text: string) {
  if (!loading) return null;
  return (
    <div className="buff-card-loading" aria-live="polite" aria-busy="true">
      <span>{text}</span>
    </div>
  );
}

function HeaderRefreshButton({
  loading,
  disabled,
  idleLabel,
  loadingLabel,
  onClick,
}: {
  loading: boolean;
  disabled: boolean;
  idleLabel: string;
  loadingLabel: string;
  onClick: () => void;
}) {
  const label = loading ? loadingLabel : idleLabel;
  return (
    <button
      type="button"
      className={`buff-panel-refresh${loading ? " is-loading" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M12 5a7 7 0 0 1 6.62 4.75H16v2h6V5h-2v3.24A9 9 0 0 0 3 12h2a7 7 0 0 1 7-7Zm7 6a7 7 0 0 1-7 7 7 7 0 0 1-6.62-4.75H8v-2H2v6h2v-3.24A9 9 0 0 0 21 12h-2Z"
        />
      </svg>
    </button>
  );
}

export function BuffMarketDashboard() {
  const [tab, setTab] = useState<BuffMarketTab>("selling");
  const [pageNum, setPageNum] = useState("1");
  const [pageSize, setPageSize] = useState("20");
  const [search, setSearch] = useState("");
  const [categoryGroup, setCategoryGroup] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [days, setDays] = useState("30");
  const [manualGoodsId, setManualGoodsId] = useState("35263");
  const [cookie, setCookie] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [listLoading, setListLoading] = useState(false);
  const [listAppendLoading, setListAppendLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [valveLoading, setValveLoading] = useState(false);
  const [valveImpactLoading, setValveImpactLoading] = useState(false);
  const [proLoading, setProLoading] = useState(false);
  const [proImpactLoading, setProImpactLoading] = useState(false);
  const [intelEvaluationLoading, setIntelEvaluationLoading] = useState(false);
  const [intelAlertsLoading, setIntelAlertsLoading] = useState(false);
  const [listStatus, setListStatus] = useState("");
  const [detailStatus, setDetailStatus] = useState("");
  const [forecastStatus, setForecastStatus] = useState("");
  const [valveStatus, setValveStatus] = useState("");
  const [valveImpactStatus, setValveImpactStatus] = useState("");
  const [proStatus, setProStatus] = useState("");
  const [proImpactStatus, setProImpactStatus] = useState("");
  const [intelEvaluationStatus, setIntelEvaluationStatus] = useState("");
  const [intelAlertsStatus, setIntelAlertsStatus] = useState("");

  const [selectedGoodsId, setSelectedGoodsId] = useState<number | null>(null);
  const [marketResult, setMarketResult] = useState<BuffMarketListResult | null>(null);
  const [dashboard, setDashboard] = useState<BuffGoodsDashboardResult | null>(null);
  const [forecast, setForecast] = useState<BuffForecastResult | null>(null);
  const [valveUpdates, setValveUpdates] = useState<ValveUpdatesResult | null>(null);
  const [valveImpact, setValveImpact] = useState<ValveImpactResult | null>(null);
  const [proEvents, setProEvents] = useState<ProPlayerEventsResult | null>(null);
  const [proImpact, setProImpact] = useState<ProImpactResult | null>(null);
  const [intelLookbackDays, setIntelLookbackDays] = useState("60");
  const [intelLookbackHours, setIntelLookbackHours] = useState("48");
  const [intelEvaluation, setIntelEvaluation] = useState<IntelEvaluationApiResponse["result"] | null>(null);
  const [intelAlerts, setIntelAlerts] = useState<IntelAlertsApiResponse["result"] | null>(null);
  const [favoriteItems, setFavoriteItems] = useState<BuffFavoriteItem[]>([]);
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [favoriteLookupLoading, setFavoriteLookupLoading] = useState(false);
  const [favoriteLookupResult, setFavoriteLookupResult] = useState<BuffFavoritesLookupResult | null>(null);

  const bootstrappedRef = useRef(false);
  const marketListRef = useRef<HTMLDivElement | null>(null);
  const marketListSentinelRef = useRef<HTMLDivElement | null>(null);
  const marketPagingLockRef = useRef(false);

  const quickJumpTargets = useMemo<QuickJumpTarget[]>(() => {
    const targets: QuickJumpTarget[] = [
      { id: "section-buff-query", label: "查询" },
      { id: "section-buff-overview", label: "概览" },
      { id: "section-buff-valve", label: "官方事件" },
      { id: "section-buff-pro", label: "职业事件" },
      { id: "section-buff-evaluation", label: "因子评估" },
      { id: "section-buff-alerts", label: "异动告警" },
      { id: "section-buff-sources", label: "数据源方案" },
      { id: "section-buff-factors", label: "因子映射" },
    ];
    if (forecast || forecastLoading) {
      targets.splice(2, 0, { id: "section-buff-forecast", label: "趋势预测" });
    }
    return targets;
  }, [forecast, forecastLoading]);

  const favoriteGoodsIds = useMemo(() => {
    return new Set(favoriteItems.map((item) => item.goodsId));
  }, [favoriteItems]);

  const favoriteLookupItemMap = useMemo(() => {
    return new Map((favoriteLookupResult?.items ?? []).map((item) => [item.goodsId, item]));
  }, [favoriteLookupResult?.items]);

  const displayedMarketItems = useMemo(() => {
    const items = marketResult?.items ?? [];
    if (!favoritesOnly) return items;
    return favoriteItems.map((favorite) => favoriteLookupItemMap.get(favorite.goodsId) ?? favoriteToMarketListItem(favorite));
  }, [favoriteItems, favoriteLookupItemMap, favoritesOnly, marketResult?.items]);

  const selectedItem = useMemo(() => {
    if (selectedGoodsId === null) return null;
    const fromMarket = (marketResult?.items ?? []).find((item) => item.goodsId === selectedGoodsId);
    if (fromMarket) return fromMarket;
    const fromFavoriteLookup = favoriteLookupItemMap.get(selectedGoodsId);
    if (fromFavoriteLookup) return fromFavoriteLookup;
    const fromFavoriteLocal = favoriteItems.find((item) => item.goodsId === selectedGoodsId);
    return fromFavoriteLocal ? favoriteToMarketListItem(fromFavoriteLocal) : null;
  }, [favoriteItems, favoriteLookupItemMap, marketResult?.items, selectedGoodsId]);

  const hasNextMarketPage = useMemo(() => {
    if (!marketResult) return false;
    const totalPage = marketResult.totalPage || 1;
    return marketResult.pageNum < totalPage;
  }, [marketResult]);

  const selectedFavoritePayload = useMemo(() => {
    if (selectedGoodsId === null) return null;
    return {
      goodsId: selectedGoodsId,
      name: dashboard?.goodsInfo?.name ?? selectedItem?.name ?? null,
      shortName: dashboard?.goodsInfo?.shortName ?? selectedItem?.shortName ?? null,
      marketHashName: dashboard?.goodsInfo?.marketHashName ?? selectedItem?.marketHashName ?? null,
      iconUrl: dashboard?.goodsInfo?.iconUrl ?? selectedItem?.iconUrl ?? null,
    };
  }, [
    dashboard?.goodsInfo?.iconUrl,
    dashboard?.goodsInfo?.marketHashName,
    dashboard?.goodsInfo?.name,
    dashboard?.goodsInfo?.shortName,
    selectedGoodsId,
    selectedItem?.iconUrl,
    selectedItem?.marketHashName,
    selectedItem?.name,
    selectedItem?.shortName,
  ]);

  const isSelectedFavorite = useMemo(() => {
    if (selectedGoodsId === null) return false;
    return favoriteGoodsIds.has(selectedGoodsId);
  }, [favoriteGoodsIds, selectedGoodsId]);

  const selectedIconUrl = useMemo(() => {
    return dashboard?.goodsInfo?.iconUrl ?? selectedItem?.iconUrl ?? null;
  }, [dashboard?.goodsInfo?.iconUrl, selectedItem?.iconUrl]);

  const forecastGoodsLabel = useMemo(() => {
    return (
      forecast?.goodsName ??
      dashboard?.goodsInfo?.name ??
      dashboard?.goodsInfo?.shortName ??
      selectedItem?.name ??
      selectedItem?.shortName ??
      null
    );
  }, [dashboard?.goodsInfo?.name, dashboard?.goodsInfo?.shortName, forecast?.goodsName, selectedItem?.name, selectedItem?.shortName]);

  const chartData = useMemo(() => {
    const points = dashboard?.priceHistory?.primarySeries?.points ?? [];
    return {
      labels: points.map((point) => fmtTime(point.at)),
      values: points.map((point) => point.price),
    };
  }, [dashboard]);

  const availableDays = useMemo(() => {
    return (dashboard?.historyDaysBuff?.options ?? []).filter((item) => !item.disabled);
  }, [dashboard]);

  const combinedWarnings = useMemo(() => {
    const merged = new Set<string>();
    for (const warning of dashboard?.warnings ?? []) merged.add(warning);
    for (const warning of dashboard?.priceHistory?.warnings ?? []) merged.add(warning);
    for (const warning of forecast?.warnings ?? []) merged.add(warning);
    for (const warning of marketResult?.warnings ?? []) merged.add(warning);
    for (const warning of valveUpdates?.warnings ?? []) merged.add(warning);
    for (const warning of valveImpact?.warnings ?? []) merged.add(warning);
    for (const warning of proEvents?.warnings ?? []) merged.add(warning);
    for (const warning of proImpact?.warnings ?? []) merged.add(warning);
    return [...merged];
  }, [dashboard, forecast, marketResult, proEvents, proImpact, valveImpact, valveUpdates]);

  const buildAuthPayload = useCallback(() => {
    const normalizedCookie = cookie.trim();
    const normalizedCsrf = csrfToken.trim();
    return {
      cookie: normalizedCookie || undefined,
      csrfToken: normalizedCsrf || undefined,
    };
  }, [cookie, csrfToken]);

  const toggleFavorite = useCallback(
    (item: Omit<BuffFavoriteItem, "savedAt">) => {
      setFavoriteItems((previous) => {
        const exists = previous.some((current) => current.goodsId === item.goodsId);
        if (exists) {
          return previous.filter((current) => current.goodsId !== item.goodsId);
        }

        const next: BuffFavoriteItem = {
          ...item,
          savedAt: new Date().toISOString(),
        };
        return [next, ...previous].slice(0, BUFF_FAVORITES_LIMIT);
      });
    },
    [],
  );

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(BUFF_FAVORITES_STORAGE_KEY);
      if (!rawValue) return;
      const parsed = JSON.parse(rawValue) as unknown;
      setFavoriteItems(normalizeFavoriteItems(parsed));
    } catch {
      setFavoriteItems([]);
    } finally {
      setFavoritesHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!favoritesHydrated) return;
    try {
      window.localStorage.setItem(BUFF_FAVORITES_STORAGE_KEY, JSON.stringify(favoriteItems));
    } catch {
      // Ignore quota or privacy mode failures.
    }
  }, [favoriteItems, favoritesHydrated]);

  const loadFavoriteMarketItems = useCallback(
    async (goodsIds: number[]) => {
      if (!goodsIds.length) {
        setFavoriteLookupResult(null);
        return;
      }

      setFavoriteLookupLoading(true);
      try {
        const response = await fetch("/api/buff/favorites", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...NO_CACHE_HEADERS,
          },
          body: JSON.stringify({
            goodsIds,
            game: "csgo",
            ...buildAuthPayload(),
          }),
        });

        const data = (await response.json()) as BuffFavoritesLookupApiResponse;
        if (!response.ok || !data.ok || !data.result) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        setFavoriteLookupResult(data.result);
      } catch (error) {
        setListStatus(`收藏商品拉取失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setFavoriteLookupLoading(false);
      }
    },
    [buildAuthPayload],
  );

  useEffect(() => {
    if (!favoritesOnly) return;
    const goodsIds = favoriteItems.map((item) => item.goodsId);
    if (!goodsIds.length) {
      setFavoriteLookupResult(null);
      return;
    }
    void loadFavoriteMarketItems(goodsIds);
  }, [favoriteItems, favoritesOnly, loadFavoriteMarketItems]);

  const loadForecast = useCallback(
    async (goodsId: number) => {
      setForecastLoading(true);
      setForecastStatus("");
      setForecast((previous) => (previous?.goodsId === goodsId ? previous : null));
      try {
        const dayValue = Number(days);
        if (!Number.isInteger(dayValue) || dayValue < 1 || dayValue > 120) {
          throw new Error("days 需为 1-120 的整数");
        }

        const response = await fetch("/api/buff/forecast", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...NO_CACHE_HEADERS,
          },
          body: JSON.stringify({
            goodsId,
            game: "csgo",
            days: dayValue,
            currency: "CNY",
            eventLimit: 16,
            ...buildAuthPayload(),
          }),
        });

        const data = (await response.json()) as BuffForecastApiResponse;
        if (!response.ok || !data.ok || !data.result) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        setForecast(data.result);
        setForecastStatus(
          `趋势预测刷新成功：${fmtTime(data.result.fetchedAt)}（${forecastTrendText(data.result.trend)} / 置信度 ${data.result.confidence}%）`,
        );
      } catch (error) {
        setForecast(null);
        setForecastStatus(`趋势预测刷新失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setForecastLoading(false);
      }
    },
    [buildAuthPayload, days],
  );

  const loadValveUpdates = useCallback(async () => {
    setValveLoading(true);
    setValveStatus("");
    try {
      const response = await fetch(`/api/valve/updates?limit=16&_=${Date.now()}`, {
        cache: "no-store",
        headers: NO_CACHE_HEADERS,
      });
      const data = (await response.json()) as ValveUpdatesApiResponse;
      if (!response.ok || !data.ok || !data.result) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setValveUpdates(data.result);
      setValveStatus(`官方事件刷新成功：${fmtTime(data.result.fetchedAt)}（${data.result.updates.length} 条）`);
    } catch (error) {
      setValveUpdates(null);
      setValveStatus(`官方事件刷新失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setValveLoading(false);
    }
  }, []);

  const loadValveImpact = useCallback(
    async (goodsId: number) => {
      setValveImpactLoading(true);
      setValveImpactStatus("");

      try {
        const dayValue = Number(days);
        if (!Number.isInteger(dayValue) || dayValue < 1 || dayValue > 120) {
          throw new Error("days 需为 1-120 的整数");
        }

        const response = await fetch("/api/valve/impact", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...NO_CACHE_HEADERS,
          },
          body: JSON.stringify({
            goodsId,
            game: "csgo",
            days: dayValue,
            currency: "CNY",
            eventLimit: 12,
            ...buildAuthPayload(),
          }),
        });

        const data = (await response.json()) as ValveImpactApiResponse;
        if (!response.ok || !data.ok || !data.result) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        setValveImpact(data.result);
        setValveImpactStatus(`影响回放已刷新：${fmtTime(data.result.fetchedAt)}（${data.result.events.length} 条事件）`);
      } catch (error) {
        setValveImpact(null);
        setValveImpactStatus(`影响回放刷新失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setValveImpactLoading(false);
      }
    },
    [buildAuthPayload, days],
  );

  const loadProEvents = useCallback(async () => {
    setProLoading(true);
    setProStatus("");
    try {
      const response = await fetch(`/api/pro/events?limit=16&_=${Date.now()}`, {
        cache: "no-store",
        headers: NO_CACHE_HEADERS,
      });
      const data = (await response.json()) as ProEventsApiResponse;
      if (!response.ok || !data.ok || !data.result) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setProEvents(data.result);
      setProStatus(`职业事件刷新成功：${fmtTime(data.result.fetchedAt)}（${data.result.events.length} 条）`);
    } catch (error) {
      setProEvents(null);
      setProStatus(`职业事件刷新失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProLoading(false);
    }
  }, []);

  const loadProImpact = useCallback(
    async (goodsId: number) => {
      setProImpactLoading(true);
      setProImpactStatus("");
      try {
        const dayValue = Number(days);
        if (!Number.isInteger(dayValue) || dayValue < 1 || dayValue > 120) {
          throw new Error("days 需为 1-120 的整数");
        }

        const response = await fetch("/api/pro/impact", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...NO_CACHE_HEADERS,
          },
          body: JSON.stringify({
            goodsId,
            game: "csgo",
            days: dayValue,
            currency: "CNY",
            eventLimit: 12,
            ...buildAuthPayload(),
          }),
        });

        const data = (await response.json()) as ProImpactApiResponse;
        if (!response.ok || !data.ok || !data.result) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        setProImpact(data.result);
        setProImpactStatus(`职业影响回放已刷新：${fmtTime(data.result.fetchedAt)}（${data.result.events.length} 条事件）`);
      } catch (error) {
        setProImpact(null);
        setProImpactStatus(`职业影响回放刷新失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setProImpactLoading(false);
      }
    },
    [buildAuthPayload, days],
  );

  const loadIntelEvaluation = useCallback(
    async (goodsId: number | null) => {
      setIntelEvaluationLoading(true);
      setIntelEvaluationStatus("");

      try {
        const lookbackDays = Number(intelLookbackDays);
        if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 3650) {
          throw new Error("评估窗口需为 1-3650 天整数");
        }

        const response = await fetch("/api/intel/evaluation", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...NO_CACHE_HEADERS,
          },
          body: JSON.stringify({
            lookbackDays,
            goodsId: goodsId ?? undefined,
          }),
        });

        const data = (await response.json()) as IntelEvaluationApiResponse;
        if (!response.ok || !data.ok || !data.result) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        setIntelEvaluation(data.result);
        const sampleCount = data.result.report.metrics.reduce((acc, item) => acc + item.sampleCount, 0);
        setIntelEvaluationStatus(
          `评估刷新成功：${fmtTime(data.result.report.generatedAt)} · 样本 ${fmtCount(sampleCount)} · ${data.result.storage}`,
        );
      } catch (error) {
        setIntelEvaluation(null);
        setIntelEvaluationStatus(`评估刷新失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIntelEvaluationLoading(false);
      }
    },
    [intelLookbackDays],
  );

  const loadIntelAlerts = useCallback(
    async (goodsId: number | null) => {
      setIntelAlertsLoading(true);
      setIntelAlertsStatus("");

      try {
        const lookbackHours = Number(intelLookbackHours);
        if (!Number.isInteger(lookbackHours) || lookbackHours < 1 || lookbackHours > 24 * 30) {
          throw new Error("告警窗口需为 1-720 小时整数");
        }

        const response = await fetch("/api/intel/alerts", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...NO_CACHE_HEADERS,
          },
          body: JSON.stringify({
            lookbackHours,
            goodsId: goodsId ?? undefined,
          }),
        });

        const data = (await response.json()) as IntelAlertsApiResponse;
        if (!response.ok || !data.ok || !data.result) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        setIntelAlerts(data.result);
        setIntelAlertsStatus(
          `告警刷新成功：${fmtTime(data.result.report.generatedAt)} · ${data.result.report.alerts.length} 条 · ${data.result.storage}`,
        );
      } catch (error) {
        setIntelAlerts(null);
        setIntelAlertsStatus(`告警刷新失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIntelAlertsLoading(false);
      }
    },
    [intelLookbackHours],
  );

  const loadGoodsDashboard = useCallback(
    async (goodsId: number) => {
      setDetailLoading(true);
      setDetailStatus("");
      try {
        const dayValue = Number(days);
        if (!Number.isInteger(dayValue) || dayValue < 1 || dayValue > 120) {
          throw new Error("days 需为 1-120 的整数");
        }

        // 预测可与详情并行，避免首次选择时卡片长时间不出现。
        void loadForecast(goodsId);

        const response = await fetch(`/api/buff/goods/${goodsId}`, {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...NO_CACHE_HEADERS,
          },
          body: JSON.stringify({
            days: dayValue,
            ordersPageNum: 1,
            currency: "CNY",
            game: "csgo",
            ...buildAuthPayload(),
          }),
        });

        const data = (await response.json()) as BuffGoodsApiResponse;
        if (!response.ok || !data.ok || !data.result) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        setDashboard(data.result);
        setDetailStatus(`详情刷新成功：${fmtTime(data.result.fetchedAt)}`);
        void loadValveImpact(goodsId);
        void loadProImpact(goodsId);
        void loadIntelEvaluation(goodsId);
        void loadIntelAlerts(goodsId);
      } catch (error) {
        setDashboard(null);
        setForecast(null);
        setValveImpact(null);
        setProImpact(null);
        setDetailStatus(`详情刷新失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setDetailLoading(false);
      }
    },
    [buildAuthPayload, days, loadForecast, loadIntelAlerts, loadIntelEvaluation, loadProImpact, loadValveImpact],
  );

  const loadMarketList = useCallback(
    async ({
      keepSelection = true,
      append = false,
      pageNumOverride,
    }: {
      keepSelection?: boolean;
      append?: boolean;
      pageNumOverride?: number;
    } = {}) => {
      if (append) {
        setListAppendLoading(true);
      } else {
        setListLoading(true);
      }
      setListStatus("");

      try {
        const normalizedPageNum = pageNumOverride ?? Number(pageNum);
        const normalizedPageSize = Number(pageSize);
        if (!Number.isInteger(normalizedPageNum) || normalizedPageNum < 1 || normalizedPageNum > 10_000) {
          throw new Error("page_num 需为 1-10000 的整数");
        }
        if (!Number.isInteger(normalizedPageSize) || normalizedPageSize < 1 || normalizedPageSize > 80) {
          throw new Error("page_size 需为 1-80 的整数");
        }

        const response = await fetch("/api/buff/market", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...NO_CACHE_HEADERS,
          },
          body: JSON.stringify({
            tab,
            game: "csgo",
            pageNum: normalizedPageNum,
            pageSize: normalizedPageSize,
            search,
            categoryGroup,
            sortBy,
            ...buildAuthPayload(),
          }),
        });

        const data = (await response.json()) as BuffMarketApiResponse;
        if (!response.ok || !data.ok || !data.result) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }
        const result = data.result;

        if (append) {
          setMarketResult((previous) => {
            if (!previous) return result;
            return {
              ...result,
              items: mergeMarketItems(previous.items, result.items),
            };
          });
          setListStatus(
            `列表已加载到第 ${result.pageNum}/${result.totalPage || 1} 页（累计 ${fmtCount(result.totalCount)} 条）`,
          );
          return;
        }

        setMarketResult({
          ...result,
          items: [...result.items],
        });
        setListStatus(
          `列表刷新成功：${tabLabel(result.tab)}，第 ${result.pageNum}/${result.totalPage || 1} 页，共 ${fmtCount(
            result.totalCount,
          )} 条`,
        );

        const goodsIds = result.items.map((item) => item.goodsId);
        const currentValid = selectedGoodsId !== null && goodsIds.includes(selectedGoodsId);
        let nextGoodsId = selectedGoodsId;

        if (!keepSelection || !currentValid) {
          nextGoodsId = goodsIds[0] ?? null;
        }

        setSelectedGoodsId(nextGoodsId);
        if (nextGoodsId !== null) {
          setManualGoodsId(String(nextGoodsId));
          await loadGoodsDashboard(nextGoodsId);
        } else {
          setDashboard(null);
          setForecast(null);
          setValveImpact(null);
          setProImpact(null);
          setDetailStatus("当前筛选条件下没有商品数据。");
        }
      } catch (error) {
        const action = append ? "下一页加载失败" : "列表刷新失败";
        setListStatus(`${action}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (append) {
          setListAppendLoading(false);
        } else {
          setListLoading(false);
        }
      }
    },
    [
      buildAuthPayload,
      categoryGroup,
      loadGoodsDashboard,
      pageNum,
      pageSize,
      search,
      selectedGoodsId,
      sortBy,
      tab,
    ],
  );

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void loadMarketList({ keepSelection: false });
    void loadValveUpdates();
    void loadProEvents();
    void loadIntelEvaluation(null);
    void loadIntelAlerts(null);
  }, [loadIntelAlerts, loadIntelEvaluation, loadMarketList, loadProEvents, loadValveUpdates]);

  const loadNextMarketPage = useCallback(async () => {
    if (!marketResult || listLoading || listAppendLoading || marketPagingLockRef.current) return;
    const totalPage = marketResult.totalPage || 1;
    const nextPageNum = marketResult.pageNum + 1;
    if (nextPageNum > totalPage) return;

    marketPagingLockRef.current = true;
    try {
      await loadMarketList({
        append: true,
        keepSelection: true,
        pageNumOverride: nextPageNum,
      });
    } finally {
      marketPagingLockRef.current = false;
    }
  }, [listAppendLoading, listLoading, loadMarketList, marketResult]);

  useEffect(() => {
    const root = marketListRef.current;
    const target = marketListSentinelRef.current;
    if (!root || !target || !hasNextMarketPage || favoritesOnly) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadNextMarketPage();
        }
      },
      {
        root,
        rootMargin: "0px 0px 140px 0px",
        threshold: 0.08,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [favoritesOnly, hasNextMarketPage, loadNextMarketPage]);

  const onMarketSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadMarketList({ keepSelection: true });
  };

  const runManualGoodsLookup = async () => {
    const parsed = Number(manualGoodsId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setDetailStatus("goods_id 必须为正整数");
      return;
    }
    setSelectedGoodsId(parsed);
    await loadGoodsDashboard(parsed);
  };

  const onPickGoods = async (goodsId: number) => {
    setSelectedGoodsId(goodsId);
    setManualGoodsId(String(goodsId));
    await loadGoodsDashboard(goodsId);
  };

  const renderOrderPanel = (orderList: BuffOrderListResult | null) => {
    if (!orderList) {
      return <p className="buff-muted">暂无数据。</p>;
    }

    return (
      <div className="buff-order-wrap">
        <p className="buff-order-meta">
          共 {fmtCount(orderList.totalCount)} 条，当前展示 {orderList.items.length} 条
        </p>
        {!orderList.items.length ? (
          <p className="buff-muted">暂无记录。</p>
        ) : (
          <div className="buff-order-scroll">
            <table className="buff-order-table">
              <thead>
                <tr>
                  <th>图片</th>
                  <th>价格</th>
                  <th>数量</th>
                  <th>状态</th>
                  <th>更新时间</th>
                </tr>
              </thead>
              <tbody>
                {orderList.items.slice(0, 12).map((item) => (
                  <tr key={`${orderList.kind}-${item.id}`}>
                    <td>
                      {item.iconUrl ? (
                        <img
                          className="buff-order-thumb"
                          src={item.iconUrl}
                          alt="订单饰品图"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="buff-order-thumb-empty">-</span>
                      )}
                    </td>
                    <td>{fmtPrice(item.price)}</td>
                    <td>{fmtCount(item.num)}</td>
                    <td>{item.stateText ?? "-"}</td>
                    <td>{fmtTime(item.updatedAt ?? item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  function jumpToSection(targetId: string) {
    const element = document.getElementById(targetId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="shell buff-shell">
      <div className="buff-ambient" aria-hidden="true">
        <span className="buff-ambient-base" />
        <span className="buff-ambient-glow glow-a" />
        <span className="buff-ambient-glow glow-b" />
        <span className="buff-ambient-glow glow-c" />
        <span className="buff-ambient-noise" />
      </div>

      <section className="panel buff-head">
        <div>
          <p className="eyebrow">cs2 buff market explorer</p>
          <h1>CS2 网易 BUFF 市场分析</h1>
          <p className="buff-muted">
            已接入 BUFF 首页列表和商品详情核心接口，支持从列表筛选到单品挂单/成交/走势的一体化查看。
          </p>
        </div>
        <div className="buff-head-actions">
          <a className="hero-link-button" href="/source-health">
            数据源健康
          </a>
        </div>
      </section>

      <form id="section-buff-query" className="panel buff-query-form anchor-target" onSubmit={onMarketSubmit}>
        <div className="buff-search-row">
          <label className="buff-search-main">
            名称搜索
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="例如 M4A4 / AK-47" />
          </label>
        </div>

        <details className="buff-advanced-filters">
          <summary>更多筛选与参数、操作</summary>
          <div className="buff-query-grid">
            <label>
              列表类型
              <select value={tab} onChange={(event) => setTab(event.target.value as BuffMarketTab)}>
                <option value="selling">selling（在售）</option>
                <option value="buying">buying（求购）</option>
                <option value="bundle">bundle（组合包）</option>
                <option value="all">all（全量搜索）</option>
              </select>
            </label>
            <label>
              page_num
              <input type="number" min={1} max={10000} value={pageNum} onChange={(event) => setPageNum(event.target.value)} />
            </label>
            <label>
              page_size
              <input type="number" min={1} max={80} value={pageSize} onChange={(event) => setPageSize(event.target.value)} />
            </label>
            <label>
              走势天数 days
              <input type="number" min={1} max={120} value={days} onChange={(event) => setDays(event.target.value)} />
            </label>
            <label>
              评估窗口 days
              <input
                type="number"
                min={1}
                max={3650}
                value={intelLookbackDays}
                onChange={(event) => setIntelLookbackDays(event.target.value)}
              />
            </label>
            <label>
              告警窗口 hours
              <input
                type="number"
                min={1}
                max={720}
                value={intelLookbackHours}
                onChange={(event) => setIntelLookbackHours(event.target.value)}
              />
            </label>
            <label>
              category_group
              <input
                value={categoryGroup}
                onChange={(event) => setCategoryGroup(event.target.value)}
                placeholder="例如 rifle / weapon"
              />
            </label>
            <label>
              sort_by
              <input value={sortBy} onChange={(event) => setSortBy(event.target.value)} placeholder="例如 price.desc" />
            </label>
            <label>
              直达 goods_id
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={manualGoodsId}
                onChange={(event) => setManualGoodsId(event.target.value)}
              />
            </label>
          </div>

          <div className="buff-auth-grid">
            <label>
              临时 Cookie（可选）
              <textarea
                value={cookie}
                onChange={(event) => setCookie(event.target.value)}
                placeholder="不填则读取服务端 BUFF_COOKIE"
                rows={3}
              />
            </label>
            <label>
              临时 csrf_token（可选）
              <input
                value={csrfToken}
                onChange={(event) => setCsrfToken(event.target.value)}
                placeholder="不填则读取服务端 BUFF_CSRF_TOKEN"
              />
            </label>
          </div>

          <div className="buff-more-actions">
            <p className="buff-more-subtitle">更多操作</p>
            <div className="buff-secondary-action-list">
              <button
                type="button"
                className="buff-secondary-action"
                disabled={detailLoading || selectedGoodsId === null}
                onClick={() => {
                  if (selectedGoodsId !== null) {
                    void loadGoodsDashboard(selectedGoodsId);
                  }
                }}
              >
                {detailLoading ? "详情加载中..." : "刷新当前商品详情"}
              </button>
              <button type="button" className="buff-secondary-action" disabled={detailLoading} onClick={() => void runManualGoodsLookup()}>
                按 goods_id 拉取详情
              </button>
              <button
                type="button"
                className="buff-secondary-action"
                disabled={forecastLoading || selectedGoodsId === null}
                onClick={() => {
                  if (selectedGoodsId !== null) {
                    void loadForecast(selectedGoodsId);
                  }
                }}
              >
                {forecastLoading ? "预测加载中..." : "刷新趋势预测"}
              </button>
              <button
                type="button"
                className="buff-secondary-action"
                disabled={intelEvaluationLoading}
                onClick={() => void loadIntelEvaluation(selectedGoodsId)}
              >
                {intelEvaluationLoading ? "评估加载中..." : "刷新因子评估"}
              </button>
              <button
                type="button"
                className="buff-secondary-action"
                disabled={intelAlertsLoading}
                onClick={() => void loadIntelAlerts(selectedGoodsId)}
              >
                {intelAlertsLoading ? "告警加载中..." : "刷新异动告警"}
              </button>
            </div>
          </div>
        </details>

        <div className="buff-action-row">
          <button type="submit" className="buff-primary-action" disabled={listLoading || listAppendLoading || detailLoading}>
            {listLoading ? "搜索中..." : "搜索"}
          </button>
        </div>

        {listStatus ? <p className="status">{listStatus}</p> : null}
        {detailStatus ? <p className="status">{detailStatus}</p> : null}
        {forecastStatus ? <p className="status">{forecastStatus}</p> : null}
        {valveStatus ? <p className="status">{valveStatus}</p> : null}
        {valveImpactStatus ? <p className="status">{valveImpactStatus}</p> : null}
        {proStatus ? <p className="status">{proStatus}</p> : null}
        {proImpactStatus ? <p className="status">{proImpactStatus}</p> : null}
        {intelEvaluationStatus ? <p className="status">{intelEvaluationStatus}</p> : null}
        {intelAlertsStatus ? <p className="status">{intelAlertsStatus}</p> : null}
      </form>

      <section id="section-buff-overview" className="grid cols-2 buff-explorer-grid anchor-target">
        <article className={loadingCardClassName("panel buff-market-panel", listLoading)}>
          {renderCardLoading(listLoading, "列表加载中...")}
          <div className="panel-header">
            <h2>首页列表</h2>
            <span>
              {marketResult ? (
                <>
                  {tabLabel(marketResult.tab)} · {fmtCount(marketResult.totalCount)} 条 · 第 {marketResult.pageNum}/
                  {marketResult.totalPage || 1} 页
                </>
              ) : (
                "未加载"
              )}
            </span>
          </div>
          <div className="buff-market-toolbar">
            <button
              type="button"
              className={`buff-market-filter-toggle${favoritesOnly ? " is-active" : ""}`}
              onClick={() => setFavoritesOnly((current) => !current)}
            >
              {favoritesOnly ? "显示全部商品" : "只看收藏"}
            </button>
            <span className="buff-market-favorite-count">收藏 {favoriteItems.length} 项</span>
          </div>

          <div className="buff-market-list" ref={marketListRef}>
            {displayedMarketItems.length ? (
              <>
                {displayedMarketItems.map((item) => (
                  <div className="buff-market-item-wrap" key={item.goodsId}>
                    <button
                      type="button"
                      className={marketFavoriteButtonClass(favoriteGoodsIds.has(item.goodsId))}
                      onClick={() =>
                        toggleFavorite({
                          goodsId: item.goodsId,
                          name: item.name,
                          shortName: item.shortName,
                          marketHashName: item.marketHashName,
                          iconUrl: item.iconUrl,
                        })
                      }
                      aria-label={favoriteGoodsIds.has(item.goodsId) ? "取消收藏商品" : "收藏商品"}
                      title={`${favoriteGoodsIds.has(item.goodsId) ? "取消收藏" : "收藏"}：${marketItemDisplayName(item)}`}
                    >
                      {favoriteGoodsIds.has(item.goodsId) ? "★" : "☆"}
                    </button>

                    <button
                      type="button"
                      className={marketItemClass(item.goodsId === selectedGoodsId)}
                      onClick={() => {
                        void onPickGoods(item.goodsId);
                      }}
                    >
                      {item.iconUrl ? (
                        <img
                          className="buff-market-item-thumb"
                          src={item.iconUrl}
                          alt={item.name ?? `goods ${item.goodsId}`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <div className="buff-market-item-head">
                        <strong>{item.name ?? `goods_id ${item.goodsId}`}</strong>
                        <span>#{item.goodsId}</span>
                      </div>
                      <p>{item.shortName ?? item.marketHashName ?? "-"}</p>
                      <div className="buff-market-item-metrics">
                        <span>在售 {fmtPrice(item.sellMinPrice)}</span>
                        <span>求购 {fmtPrice(item.buyMaxPrice)}</span>
                        <span>在售量 {fmtCount(item.sellNum)}</span>
                        <span>求购量 {fmtCount(item.buyNum)}</span>
                      </div>
                    </button>
                  </div>
                ))}

                <div className="buff-market-list-sentinel" ref={marketListSentinelRef} aria-hidden="true" />

                {favoritesOnly ? (
                  favoriteLookupLoading ? (
                    <p className="buff-market-list-footnote is-loading">正在拉取收藏商品数据...</p>
                  ) : (
                    <p className="buff-market-list-footnote">
                      已同步收藏数据 {favoriteLookupResult?.successCount ?? 0}/{favoriteItems.length}
                      {favoriteLookupResult?.failedGoodsIds?.length
                        ? ` · 失败 ${favoriteLookupResult.failedGoodsIds.length}`
                        : ""}
                    </p>
                  )
                ) : listAppendLoading ? (
                  <p className="buff-market-list-footnote is-loading">正在加载下一页...</p>
                ) : hasNextMarketPage ? (
                  <p className="buff-market-list-footnote">滚动到底自动加载下一页</p>
                ) : (
                  <p className="buff-market-list-footnote is-end">已加载全部分页</p>
                )}
              </>
            ) : (
              <p className="buff-muted">{favoritesOnly ? "暂无收藏商品，可在列表右上角点击 ☆ 收藏。" : "暂无列表数据。"}</p>
            )}
          </div>
        </article>

        <article className={loadingCardClassName("panel", detailLoading)}>
          {renderCardLoading(detailLoading, "商品详情加载中...")}
          <div className="panel-header">
            <h2>商品概览</h2>
            <span>
              {dashboard ? `goods_id=${dashboard.goodsId} · ${fmtTime(dashboard.fetchedAt)}` : "未加载"}
            </span>
          </div>
          <div className="buff-overview-actions">
            <button
              type="button"
              className={`buff-overview-fav-toggle${isSelectedFavorite ? " is-active" : ""}`}
              disabled={selectedFavoritePayload === null}
              onClick={() => {
                if (!selectedFavoritePayload) return;
                toggleFavorite(selectedFavoritePayload);
              }}
            >
              {isSelectedFavorite ? "已收藏" : "收藏商品"}
            </button>
          </div>

          {selectedIconUrl ? (
            <div className="buff-overview-visual">
              <img
                className="buff-overview-image"
                src={selectedIconUrl}
                alt={dashboard?.goodsInfo?.name ?? selectedItem?.name ?? "商品图片"}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}

          <div className="metric-grid">
            <div className="metric">
              <span>商品名称</span>
              <strong>{dashboard?.goodsInfo?.name ?? selectedItem?.name ?? "N/A"}</strong>
            </div>
            <div className="metric">
              <span>在售最低</span>
              <strong>{fmtPrice(dashboard?.goodsInfo?.sellMinPrice ?? selectedItem?.sellMinPrice ?? null)}</strong>
            </div>
            <div className="metric">
              <span>求购最高</span>
              <strong>{fmtPrice(dashboard?.goodsInfo?.buyMaxPrice ?? selectedItem?.buyMaxPrice ?? null)}</strong>
            </div>
            <div className="metric">
              <span>在售 / 求购</span>
              <strong>
                {fmtCount(dashboard?.goodsInfo?.sellNum ?? selectedItem?.sellNum ?? null)} / {" "}
                {fmtCount(dashboard?.goodsInfo?.buyNum ?? selectedItem?.buyNum ?? null)}
              </strong>
            </div>
            <div className="metric">
              <span>曲线来源</span>
              <strong>{dashboard?.priceHistory?.priceType ?? "N/A"}</strong>
            </div>
            <div className="metric">
              <span>{dashboard?.days ?? Number(days)} 天涨跌</span>
              <strong>{fmtPct(dashboard?.priceHistory?.lines.find((line) => line.key === dashboard?.priceHistory?.primaryLineKey)?.changePct ?? null)}</strong>
            </div>
            <div className="metric">
              <span>Cookie 来源</span>
              <strong>{authSourceText(dashboard?.auth.cookieSource ?? "none")}</strong>
            </div>
            <div className="metric">
              <span>CSRF 来源</span>
              <strong>{authSourceText(dashboard?.auth.csrfSource ?? "none")}</strong>
            </div>
          </div>

          {availableDays.length ? (
            <p className="buff-muted">
              可用天数：{availableDays.map((item) => `${item.text || `${item.days}天`}(${item.days})`).join(" / ")}
            </p>
          ) : null}

          {combinedWarnings.length ? (
            <div className="buff-warning-list">
              {combinedWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

        </article>
      </section>

      {selectedGoodsId !== null && (forecastLoading || forecast) ? (
        <section
          id="section-buff-forecast"
          className={loadingCardClassName("panel buff-forecast-panel anchor-target", forecastLoading)}
        >
          {renderCardLoading(forecastLoading, "趋势预测加载中...")}
          <div className="panel-header">
            <h2>综合因子趋势预测</h2>
            <span>
              {forecastGoodsLabel ? `${forecastGoodsLabel} · ` : ""}
              goods_id={forecast?.goodsId ?? selectedGoodsId}
              {forecast?.fetchedAt ? ` · ${fmtTime(forecast.fetchedAt)}` : " · 计算中..."}
            </span>
          </div>

          {forecast ? (
            <>
          <div className="metric-grid">
            <div className="metric">
              <span>方向</span>
              <strong>
                <span className={forecastTrendClass(forecast.trend)}>{forecastTrendText(forecast.trend)}</span>
              </strong>
            </div>
            <div className="metric">
              <span>置信度</span>
              <strong>{forecast.confidence}%</strong>
            </div>
            <div className="metric">
              <span>风险等级</span>
              <strong>
                <span className={forecastRiskClass(forecast.riskLevel)}>{forecastRiskText(forecast.riskLevel)}</span>
              </strong>
            </div>
            <div className="metric">
              <span>建议动作</span>
              <strong>{forecastDecisionText(forecast.recommendation.decision)}</strong>
            </div>
            <div className="metric">
              <span>预测 24h</span>
              <strong>{fmtSignedPct(forecast.predictedReturnPct.h24)}</strong>
            </div>
            <div className="metric">
              <span>预测 72h</span>
              <strong>{fmtSignedPct(forecast.predictedReturnPct.h72)}</strong>
            </div>
            <div className="metric">
              <span>最新价</span>
              <strong>{fmtPrice(forecast.snapshots.latestPrice)}</strong>
            </div>
            <div className="metric">
              <span>覆盖率</span>
              <strong>{forecast.snapshots.coveragePct.toFixed(2)}%</strong>
            </div>
            <div className="metric">
              <span>LLM 状态</span>
              <strong>
                <span className={llmStatusClass(forecast.llm.status)}>{llmStatusText(forecast.llm.status)}</span>
              </strong>
            </div>
            <div className="metric">
              <span>LLM 信号</span>
              <strong>{fmtSignedPct(forecast.snapshots.llmSignal * 100)}</strong>
            </div>
            <div className="metric">
              <span>LLM 可靠性</span>
              <strong>{(forecast.snapshots.llmReliability * 100).toFixed(1)}%</strong>
            </div>
          </div>

          <div className="buff-forecast-card">
            <p className="buff-forecast-title">{forecast.recommendation.title}</p>
            <p className="buff-forecast-summary">{forecast.recommendation.summary}</p>
            <ul className="buff-forecast-tactics">
              {forecast.recommendation.tactics.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          {forecast.llm.narrative ? (
            <div className="buff-forecast-card buff-forecast-llm-card">
              <p className="buff-forecast-title">LLM 语义分析摘要</p>
              <p className="buff-forecast-summary">{forecast.llm.narrative.summary}</p>
              <div className="buff-forecast-llm-meta">
                <span>模型：{forecast.llm.model ?? "N/A"}</span>
                <span>
                  事件：{forecast.llm.analyzedCount}/{forecast.llm.sourceCount}
                </span>
                <span>热度风险：{(forecast.llm.aggregate.hypeRisk * 100).toFixed(1)}%</span>
                <span>冲突风险：{(forecast.llm.aggregate.conflictRisk * 100).toFixed(1)}%</span>
              </div>
              {forecast.llm.narrative.risks.length ? (
                <ul className="buff-forecast-tactics">
                  {forecast.llm.narrative.risks.map((risk) => (
                    <li key={`llm-risk-${risk}`}>{risk}</li>
                  ))}
                </ul>
              ) : null}
              {forecast.llm.narrative.advice.length ? (
                <ul className="buff-forecast-tactics">
                  {forecast.llm.narrative.advice.map((advice) => (
                    <li key={`llm-advice-${advice}`}>{advice}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {forecast.llm.eventInsights.length ? (
            <div className="buff-impact-wrap">
              <table className="buff-impact-table">
                <thead>
                  <tr>
                    <th>事件时间</th>
                    <th>来源</th>
                    <th>类型</th>
                    <th>方向</th>
                    <th>相关性</th>
                    <th>可信度</th>
                    <th>主题</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.llm.eventInsights.slice(0, 12).map((event) => (
                    <tr key={`llm-event-${event.refId}`}>
                      <td>{fmtTime(event.publishedAt)}</td>
                      <td>{llmProviderText(event.provider)}</td>
                      <td>{llmEventTypeText(event.eventType)}</td>
                      <td>
                        <span className={llmDirectionClass(event.direction)}>{llmDirectionText(event.direction)}</span>
                      </td>
                      <td>{(event.relevance * 100).toFixed(1)}%</td>
                      <td>{(event.reliability * 100).toFixed(1)}%</td>
                      <td>
                        <strong>{event.topic}</strong>
                        {event.evidence.length ? <p className="buff-impact-summary">{event.evidence.join(" / ")}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="buff-impact-wrap">
            <table className="buff-impact-table">
              <thead>
                <tr>
                  <th>因子</th>
                  <th>分值</th>
                  <th>权重</th>
                  <th>贡献</th>
                  <th>明细</th>
                </tr>
              </thead>
              <tbody>
                {forecast.factors.map((factor) => (
                  <tr key={factor.key}>
                    <td>{factor.label}</td>
                    <td>{factor.score.toFixed(3)}</td>
                    <td>{factor.weight.toFixed(2)}</td>
                    <td>{factor.contribution.toFixed(3)}</td>
                    <td>{factor.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </>
          ) : (
            <p className="buff-muted">趋势预测启动中，正在拉取价格与事件因子...</p>
          )}
        </section>
      ) : null}

      {dashboard ? (
        <>
          <section className="grid cols-2">
            <article className={loadingCardClassName("panel", detailLoading)}>
              {renderCardLoading(detailLoading, "图表加载中...")}
              <h2>主曲线走势</h2>
              {chartData.labels.length ? (
                <PriceChart labels={chartData.labels} values={chartData.values} />
              ) : (
                <p className="buff-muted">暂无可视化点位。</p>
              )}
            </article>
            <article className={loadingCardClassName("panel", detailLoading)}>
              {renderCardLoading(detailLoading, "曲线字段加载中...")}
              <h2>价格曲线字段</h2>
              <div className="buff-line-list">
                {(dashboard.priceHistory?.lines ?? []).map((line) => (
                  <article className={lineCardClass(line)} key={line.key}>
                    <div className="buff-line-head">
                      <strong>{line.name}</strong>
                      <span>{line.key}</span>
                    </div>
                    <p>
                      点位: {line.pointCount} / 变化: {fmtPct(line.changePct)} / 最新: {fmtPrice(line.latestPrice)}
                    </p>
                    {line.isGated ? <p>受限提示: {line.gateMessage ?? "会员权益限制"}</p> : null}
                  </article>
                ))}
                {!dashboard.priceHistory?.lines?.length ? <p className="buff-muted">暂无曲线字段。</p> : null}
              </div>
            </article>
          </section>

          <section className={loadingCardClassName("panel", detailLoading)}>
            {renderCardLoading(detailLoading, "Tab 配置加载中...")}
            <div className="panel-header">
              <h2>详情页 Tab 配置</h2>
              <span>goods_tab_list</span>
            </div>
            <div className="buff-tab-list">
              {(dashboard.goodsTabs?.tabs ?? []).map((tabItem) => (
                <span className="buff-tab-chip" key={`${tabItem.id}-${tabItem.name}`}>
                  {tabItem.id}. {tabItem.text} ({tabItem.name})
                </span>
              ))}
              {!dashboard.goodsTabs?.tabs?.length ? <p className="buff-muted">暂无 tab 配置。</p> : null}
            </div>
          </section>

          <section className="grid cols-3 buff-order-grid">
            <article className={loadingCardClassName("panel", detailLoading)}>
              {renderCardLoading(detailLoading, "在售挂单加载中...")}
              <h2>{orderTitle(dashboard.sellOrders?.kind ?? "sell")}</h2>
              {renderOrderPanel(dashboard.sellOrders)}
            </article>
            <article className={loadingCardClassName("panel", detailLoading)}>
              {renderCardLoading(detailLoading, "求购挂单加载中...")}
              <h2>{orderTitle(dashboard.buyOrders?.kind ?? "buy")}</h2>
              {renderOrderPanel(dashboard.buyOrders)}
            </article>
            <article className={loadingCardClassName("panel", detailLoading)}>
              {renderCardLoading(detailLoading, "成交记录加载中...")}
              <h2>{orderTitle(dashboard.billOrders?.kind ?? "bill")}</h2>
              {renderOrderPanel(dashboard.billOrders)}
            </article>
          </section>
        </>
      ) : null}

      <section id="section-buff-valve" className="grid cols-2 buff-valve-grid anchor-target">
        <article className={loadingCardClassName("panel", valveLoading)}>
          {renderCardLoading(valveLoading, "官方事件加载中...")}
          <div className="panel-header buff-panel-header">
            <div className="buff-panel-title-row">
              <h2>V 社官方变更时间线</h2>
              <HeaderRefreshButton
                loading={valveLoading}
                disabled={valveLoading}
                idleLabel="刷新官方事件"
                loadingLabel="官方事件加载中"
                onClick={() => void loadValveUpdates()}
              />
            </div>
            <span>{valveUpdates ? `最近 ${valveUpdates.updates.length} 条 · ${fmtTime(valveUpdates.fetchedAt)}` : "未加载"}</span>
          </div>

          <div className="buff-valve-source-list">
            {(valveUpdates?.sourceStatus ?? []).map((item) => (
              <span className={`buff-valve-source-chip${item.ok ? " is-ok" : " is-fail"}`} key={`${item.source}-${item.endpoint}`}>
                {item.source === "steam-api" ? "ISteamNews" : "Steam RSS"} · {item.ok ? `OK (${item.itemCount})` : "FAIL"}
              </span>
            ))}
          </div>

          <div className="buff-valve-timeline">
            {(valveUpdates?.updates ?? []).map((item) => (
              <article className={valveSeverityClass(item.severity)} key={item.id}>
                <div className="buff-valve-item-head">
                  <strong>{item.title}</strong>
                  <span>{fmtTime(item.publishedAt)}</span>
                </div>
                <p>{item.summary || "无摘要"}</p>
                <p className="buff-valve-item-meta">
                  分类：{item.categories.map((category) => valveCategoryText(category)).join(" / ")} · 严重度：
                  {valveSeverityText(item.severity)}
                </p>
                {item.tags.length ? <p className="buff-valve-item-meta">标签：{item.tags.join(" / ")}</p> : null}
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="buff-valve-link">
                    查看原始公告
                  </a>
                ) : null}
              </article>
            ))}
            {!valveUpdates?.updates.length ? <p className="buff-muted">暂无官方事件数据。</p> : null}
          </div>
        </article>

        <article className={loadingCardClassName("panel", valveImpactLoading)}>
          {renderCardLoading(valveImpactLoading, "官方影响分析加载中...")}
          <div className="panel-header buff-panel-header">
            <div className="buff-panel-title-row">
              <h2>官方变更影响回放</h2>
              <HeaderRefreshButton
                loading={valveImpactLoading}
                disabled={valveImpactLoading || selectedGoodsId === null}
                idleLabel="刷新事件影响回放"
                loadingLabel="影响分析加载中"
                onClick={() => {
                  if (selectedGoodsId !== null) {
                    void loadValveImpact(selectedGoodsId);
                  }
                }}
              />
            </div>
            <span>
              {selectedGoodsId
                ? `goods_id=${selectedGoodsId} · 价格点 ${fmtCount(valveImpact?.pricePointCount ?? null)}`
                : "请先选择商品"}
            </span>
          </div>

          {valveImpact?.sourceStatus?.length ? (
            <div className="buff-valve-source-list">
              {valveImpact.sourceStatus.map((item) => (
                <span className={`buff-valve-source-chip${item.ok ? " is-ok" : " is-fail"}`} key={`impact-${item.source}-${item.endpoint}`}>
                  {item.source === "steam-api" ? "ISteamNews" : "Steam RSS"} · {item.ok ? "可用" : "失败"}
                </span>
              ))}
            </div>
          ) : null}

          {selectedGoodsId === null ? (
            <p className="buff-muted">先从左侧列表选择商品，或输入 goods_id 拉取详情后再分析。</p>
          ) : (
            <div className="buff-impact-wrap">
              <table className="buff-impact-table">
                <thead>
                  <tr>
                    <th>事件时间</th>
                    <th>事件</th>
                    <th>分类 / 严重度</th>
                    <th>1h</th>
                    <th>24h</th>
                    <th>72h</th>
                    <th>方向</th>
                    <th>影响分</th>
                  </tr>
                </thead>
                <tbody>
                  {(valveImpact?.events ?? []).map((item) => (
                    <tr key={`impact-${item.id}`}>
                      <td>{fmtTime(item.publishedAt)}</td>
                      <td>
                        <strong>{item.title}</strong>
                        <p className="buff-impact-summary">{item.summary || "无摘要"}</p>
                      </td>
                      <td>
                        {item.categories.map((category) => valveCategoryText(category)).join(" / ")}
                        <br />
                        {valveSeverityText(item.severity)}
                      </td>
                      <td>{fmtSignedPct(item.returnsPct.h1)}</td>
                      <td>{fmtSignedPct(item.returnsPct.h24)}</td>
                      <td>{fmtSignedPct(item.returnsPct.h72)}</td>
                      <td>
                        <span className={valveDirectionClass(item.direction)}>{valveDirectionText(item.direction)}</span>
                      </td>
                      <td>{item.impactScore === null ? "N/A" : item.impactScore.toFixed(3)}</td>
                    </tr>
                  ))}
                  {!valveImpact?.events?.length ? (
                    <tr>
                      <td colSpan={8}>暂无可计算事件。</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      <section id="section-buff-pro" className="grid cols-2 buff-pro-grid anchor-target">
        <article className={loadingCardClassName("panel", proLoading)}>
          {renderCardLoading(proLoading, "职业事件加载中...")}
          <div className="panel-header buff-panel-header">
            <div className="buff-panel-title-row">
              <h2>职业选手事件时间线</h2>
              <HeaderRefreshButton
                loading={proLoading}
                disabled={proLoading}
                idleLabel="刷新职业事件"
                loadingLabel="职业事件加载中"
                onClick={() => void loadProEvents()}
              />
            </div>
            <span>{proEvents ? `最近 ${proEvents.events.length} 条 · ${fmtTime(proEvents.fetchedAt)}` : "未加载"}</span>
          </div>

          <div className="buff-pro-source-list">
            {(proEvents?.sourceStatus ?? []).map((item) => (
              <span className={`buff-pro-source-chip${item.ok ? " is-ok" : " is-fail"}`} key={`${item.source}-${item.endpoint}`}>
                {item.source === "hltv-rss" ? "HLTV RSS" : "Liquipedia API"} · {item.ok ? `OK (${item.itemCount})` : "FAIL"}
              </span>
            ))}
          </div>

          <div className="buff-pro-timeline">
            {(proEvents?.events ?? []).map((item) => (
              <article className={proSeverityClass(item.severity)} key={`pro-event-${item.id}`}>
                <div className="buff-pro-item-head">
                  <strong>{item.title}</strong>
                  <span>{fmtTime(item.publishedAt)}</span>
                </div>
                <p>{item.summary || "无摘要"}</p>
                <p className="buff-pro-item-meta">
                  类型：{proEventTypeText(item.eventType)} · 严重度：{proSeverityText(item.severity)}
                </p>
                {item.players.length ? (
                  <p className="buff-pro-item-meta">
                    选手：
                    {item.players.map((player) => `${player.name}(${proPlayerStatusText(player.status)})`).join(" / ")}
                  </p>
                ) : null}
                {item.keywords.length ? <p className="buff-pro-item-meta">关键词：{item.keywords.join(" / ")}</p> : null}
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="buff-pro-link">
                    查看原始新闻
                  </a>
                ) : null}
              </article>
            ))}
            {!proEvents?.events.length ? <p className="buff-muted">暂无职业事件。</p> : null}
          </div>
        </article>

        <article className={loadingCardClassName("panel", proImpactLoading)}>
          {renderCardLoading(proImpactLoading, "职业影响分析加载中...")}
          <div className="panel-header buff-panel-header">
            <div className="buff-panel-title-row">
              <h2>职业事件影响回放</h2>
              <HeaderRefreshButton
                loading={proImpactLoading}
                disabled={proImpactLoading || selectedGoodsId === null}
                idleLabel="刷新职业影响回放"
                loadingLabel="职业影响分析加载中"
                onClick={() => {
                  if (selectedGoodsId !== null) {
                    void loadProImpact(selectedGoodsId);
                  }
                }}
              />
            </div>
            <span>
              {selectedGoodsId
                ? `goods_id=${selectedGoodsId} · 价格点 ${fmtCount(proImpact?.pricePointCount ?? null)}`
                : "请先选择商品"}
            </span>
          </div>

          {proImpact?.sourceStatus?.length ? (
            <div className="buff-pro-source-list">
              {proImpact.sourceStatus.map((item) => (
                <span className={`buff-pro-source-chip${item.ok ? " is-ok" : " is-fail"}`} key={`pro-impact-${item.source}-${item.endpoint}`}>
                  {item.source === "hltv-rss" ? "HLTV RSS" : "Liquipedia API"} · {item.ok ? "可用" : "失败"}
                </span>
              ))}
            </div>
          ) : null}

          {selectedGoodsId === null ? (
            <p className="buff-muted">先从左侧列表选择商品，或输入 goods_id 拉取详情后再分析。</p>
          ) : (
            <div className="buff-impact-wrap">
              <table className="buff-impact-table">
                <thead>
                  <tr>
                    <th>事件时间</th>
                    <th>事件</th>
                    <th>类型 / 严重度</th>
                    <th>关联分</th>
                    <th>1h</th>
                    <th>24h</th>
                    <th>72h</th>
                    <th>方向</th>
                    <th>影响分</th>
                  </tr>
                </thead>
                <tbody>
                  {(proImpact?.events ?? []).map((item) => (
                    <tr key={`pro-impact-row-${item.id}`}>
                      <td>{fmtTime(item.publishedAt)}</td>
                      <td>
                        <strong>{item.title}</strong>
                        <p className="buff-impact-summary">{item.summary || "无摘要"}</p>
                      </td>
                      <td>
                        {proEventTypeText(item.eventType)} / {proSeverityText(item.severity)}
                        {item.players.length ? (
                          <>
                            <br />
                            {item.players.map((player) => `${player.name}(${proPlayerStatusText(player.status)})`).join(" / ")}
                          </>
                        ) : null}
                      </td>
                      <td>{item.relevanceScore.toFixed(3)}</td>
                      <td>{fmtSignedPct(item.returnsPct.h1)}</td>
                      <td>{fmtSignedPct(item.returnsPct.h24)}</td>
                      <td>{fmtSignedPct(item.returnsPct.h72)}</td>
                      <td>
                        <span className={proDirectionClass(item.direction)}>{proDirectionText(item.direction)}</span>
                      </td>
                      <td>{item.impactScore === null ? "N/A" : item.impactScore.toFixed(3)}</td>
                    </tr>
                  ))}
                  {!proImpact?.events?.length ? (
                    <tr>
                      <td colSpan={9}>暂无可计算职业事件。</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      <section id="section-buff-evaluation" className={loadingCardClassName("panel anchor-target", intelEvaluationLoading)}>
        {renderCardLoading(intelEvaluationLoading, "事件因子评估加载中...")}
        <div className="panel-header">
          <h2>事件因子评估（持久化样本）</h2>
          <span>
            {intelEvaluation
              ? `生成时间 ${fmtTime(intelEvaluation.report.generatedAt)} · 窗口 ${intelEvaluation.report.lookbackDays} 天`
              : "未加载"}
          </span>
        </div>

        <div className="buff-intel-run-list">
          {(intelEvaluation?.report.runState ?? []).slice(0, 8).map((state) => (
            <p key={state.jobKey}>
              {state.jobKey} · {intelRunStatusText(state.lastStatus)} · {fmtTime(state.lastRanAt)} ·{" "}
              {state.lastMessage ?? "-"}
            </p>
          ))}
          {!intelEvaluation?.report.runState?.length ? <p className="buff-muted">暂无 pipeline 运行状态。</p> : null}
        </div>

        <div className="buff-impact-wrap">
          <table className="buff-impact-table">
            <thead>
              <tr>
                <th>来源</th>
                <th>样本数</th>
                <th>上涨率</th>
                <th>24h 平均收益</th>
                <th>|24h| 平均波动</th>
                <th>平均影响分</th>
                <th>平均关联分</th>
                <th>相关系数</th>
              </tr>
            </thead>
            <tbody>
              {(intelEvaluation?.report.metrics ?? []).map((metric) => (
                <tr key={metric.provider}>
                  <td>{intelProviderText(metric.provider)}</td>
                  <td>{fmtCount(metric.sampleCount)}</td>
                  <td>{fmtPct(metric.upRatePct)}</td>
                  <td>{fmtSignedPct(metric.avgReturnH24Pct)}</td>
                  <td>{fmtPct(metric.avgAbsReturnH24Pct)}</td>
                  <td>{metric.avgImpactScore === null ? "N/A" : metric.avgImpactScore.toFixed(3)}</td>
                  <td>{metric.avgRelevanceScore === null ? "N/A" : metric.avgRelevanceScore.toFixed(3)}</td>
                  <td>{metric.impactReturnCorrelation === null ? "N/A" : metric.impactReturnCorrelation.toFixed(3)}</td>
                </tr>
              ))}
              {!intelEvaluation?.report.metrics?.length ? (
                <tr>
                  <td colSpan={8}>暂无评估样本。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="buff-impact-wrap">
          <table className="buff-impact-table">
            <thead>
              <tr>
                <th>事件时间</th>
                <th>来源</th>
                <th>商品</th>
                <th>事件</th>
                <th>24h</th>
                <th>影响分</th>
                <th>关联分</th>
                <th>方向</th>
              </tr>
            </thead>
            <tbody>
              {(intelEvaluation?.report.topImpacts ?? []).slice(0, 24).map((impact) => {
                const payloadTitle =
                  typeof impact.payload.title === "string" ? impact.payload.title : null;
                return (
                  <tr key={`${impact.provider}-${impact.goodsId}-${impact.eventId}-${impact.id}`}>
                    <td>{fmtTime(impact.eventTime)}</td>
                    <td>{intelProviderText(impact.provider)}</td>
                    <td>{impact.goodsName ?? `goods_id ${impact.goodsId}`}</td>
                    <td>{payloadTitle ?? impact.eventId}</td>
                    <td>{fmtSignedPct(impact.returnH24)}</td>
                    <td>{impact.impactScore === null ? "N/A" : impact.impactScore.toFixed(3)}</td>
                    <td>{impact.relevanceScore === null ? "N/A" : impact.relevanceScore.toFixed(3)}</td>
                    <td>
                      <span className={intelDirectionClass(impact.direction)}>{intelDirectionText(impact.direction)}</span>
                    </td>
                  </tr>
                );
              })}
              {!intelEvaluation?.report.topImpacts?.length ? (
                <tr>
                  <td colSpan={8}>暂无影响回放样本。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section id="section-buff-alerts" className={loadingCardClassName("panel anchor-target", intelAlertsLoading)}>
        {renderCardLoading(intelAlertsLoading, "异动告警加载中...")}
        <div className="panel-header">
          <h2>异动告警（近窗口）</h2>
          <span>
            {intelAlerts
              ? `生成时间 ${fmtTime(intelAlerts.report.generatedAt)} · ${intelAlerts.report.alerts.length} 条`
              : "未加载"}
          </span>
        </div>

        {intelAlerts ? (
          <p className="buff-muted">
            阈值：impact_score ≥ {intelAlerts.report.thresholds.impactScore}，|24h| ≥{" "}
            {intelAlerts.report.thresholds.return24AbsPct}% ，关联分 ≥ {intelAlerts.report.thresholds.relevanceScore}
          </p>
        ) : null}

        <div className="buff-impact-wrap">
          <table className="buff-impact-table">
            <thead>
              <tr>
                <th>等级</th>
                <th>时间</th>
                <th>来源</th>
                <th>商品</th>
                <th>事件</th>
                <th>24h</th>
                <th>影响分 / 关联分</th>
                <th>方向</th>
                <th>触发原因</th>
              </tr>
            </thead>
            <tbody>
              {(intelAlerts?.report.alerts ?? []).map((alert) => (
                <tr key={alert.id}>
                  <td>
                    <span className={intelAlertSeverityClass(alert.severity)}>
                      {intelAlertSeverityText(alert.severity)}
                    </span>
                  </td>
                  <td>{fmtTime(alert.eventTime)}</td>
                  <td>{intelProviderText(alert.provider)}</td>
                  <td>{alert.goodsName ?? `goods_id ${alert.goodsId}`}</td>
                  <td>{alert.title}</td>
                  <td>{fmtSignedPct(alert.returnH24Pct)}</td>
                  <td>
                    {(alert.impactScore ?? 0).toFixed(3)} / {(alert.relevanceScore ?? 0).toFixed(3)}
                  </td>
                  <td>
                    <span className={intelDirectionClass(alert.direction)}>{intelDirectionText(alert.direction)}</span>
                  </td>
                  <td>{alert.reasons.join(", ")}</td>
                </tr>
              ))}
              {!intelAlerts?.report.alerts?.length ? (
                <tr>
                  <td colSpan={9}>当前窗口无触发告警。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section id="section-buff-sources" className="panel anchor-target">
        <div className="panel-header">
          <h2>数据源获取方案</h2>
          {/* <span>接口全量落地后，下一步是事件因子和价格行为做联动建模</span> */}
        </div>
        <div className="buff-source-grid">
          {SOURCE_BLUEPRINT.map((item) => (
            <article className="buff-source-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>
                <strong>更新频率：</strong>
                {item.freshness}
              </p>
              <p>
                <strong>采集方式：</strong>
                {item.method}
              </p>
              <p>
                <strong>核心信号：</strong>
                {item.signal}
              </p>
              <p>
                <strong>主要风险：</strong>
                {item.risk}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="section-buff-factors" className="panel anchor-target">
        <div className="panel-header">
          <h2>影响因子映射</h2>
          {/* <span>P0 先上线可量化数据，P1/P2 逐步扩展</span> */}
        </div>
        <div className="buff-factor-wrap">
          <table className="buff-factor-table">
            <thead>
              <tr>
                <th>优先级</th>
                <th>因子</th>
                <th>来源</th>
                <th>量化指标</th>
                <th>采样频率</th>
              </tr>
            </thead>
            <tbody>
              {FACTOR_MAP.map((item) => (
                <tr key={`${item.priority}-${item.factor}`}>
                  <td>{item.priority}</td>
                  <td>{item.factor}</td>
                  <td>{item.source}</td>
                  <td>{item.metric}</td>
                  <td>{item.frequency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <nav className="quick-nav-dock" role="navigation" aria-label="BUFF 区块快速定位">
        <div className="quick-nav-rail">
          {quickJumpTargets.map((target) => (
            <button
              key={target.id}
              type="button"
              className="quick-nav-pill"
              onClick={() => jumpToSection(target.id)}
            >
              {target.label}
            </button>
          ))}
          <button
            type="button"
            className="quick-nav-pill quick-nav-pill-top"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            回到顶部
          </button>
        </div>
      </nav>
    </main>
  );
}
