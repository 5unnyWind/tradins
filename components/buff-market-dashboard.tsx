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

  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [valveLoading, setValveLoading] = useState(false);
  const [valveImpactLoading, setValveImpactLoading] = useState(false);
  const [proLoading, setProLoading] = useState(false);
  const [proImpactLoading, setProImpactLoading] = useState(false);
  const [listStatus, setListStatus] = useState("");
  const [detailStatus, setDetailStatus] = useState("");
  const [valveStatus, setValveStatus] = useState("");
  const [valveImpactStatus, setValveImpactStatus] = useState("");
  const [proStatus, setProStatus] = useState("");
  const [proImpactStatus, setProImpactStatus] = useState("");

  const [selectedGoodsId, setSelectedGoodsId] = useState<number | null>(null);
  const [marketResult, setMarketResult] = useState<BuffMarketListResult | null>(null);
  const [dashboard, setDashboard] = useState<BuffGoodsDashboardResult | null>(null);
  const [valveUpdates, setValveUpdates] = useState<ValveUpdatesResult | null>(null);
  const [valveImpact, setValveImpact] = useState<ValveImpactResult | null>(null);
  const [proEvents, setProEvents] = useState<ProPlayerEventsResult | null>(null);
  const [proImpact, setProImpact] = useState<ProImpactResult | null>(null);

  const bootstrappedRef = useRef(false);

  const selectedItem = useMemo(() => {
    if (!marketResult || !selectedGoodsId) return null;
    return marketResult.items.find((item) => item.goodsId === selectedGoodsId) ?? null;
  }, [marketResult, selectedGoodsId]);

  const selectedIconUrl = useMemo(() => {
    return dashboard?.goodsInfo?.iconUrl ?? selectedItem?.iconUrl ?? null;
  }, [dashboard?.goodsInfo?.iconUrl, selectedItem?.iconUrl]);

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
    for (const warning of marketResult?.warnings ?? []) merged.add(warning);
    for (const warning of valveUpdates?.warnings ?? []) merged.add(warning);
    for (const warning of valveImpact?.warnings ?? []) merged.add(warning);
    for (const warning of proEvents?.warnings ?? []) merged.add(warning);
    for (const warning of proImpact?.warnings ?? []) merged.add(warning);
    return [...merged];
  }, [dashboard, marketResult, proEvents, proImpact, valveImpact, valveUpdates]);

  const buildAuthPayload = useCallback(() => {
    const normalizedCookie = cookie.trim();
    const normalizedCsrf = csrfToken.trim();
    return {
      cookie: normalizedCookie || undefined,
      csrfToken: normalizedCsrf || undefined,
    };
  }, [cookie, csrfToken]);

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

  const loadGoodsDashboard = useCallback(
    async (goodsId: number) => {
      setDetailLoading(true);
      setDetailStatus("");
      try {
        const dayValue = Number(days);
        if (!Number.isInteger(dayValue) || dayValue < 1 || dayValue > 120) {
          throw new Error("days 需为 1-120 的整数");
        }

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
      } catch (error) {
        setDashboard(null);
        setValveImpact(null);
        setProImpact(null);
        setDetailStatus(`详情刷新失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setDetailLoading(false);
      }
    },
    [buildAuthPayload, days, loadProImpact, loadValveImpact],
  );

  const loadMarketList = useCallback(
    async (keepSelection = true) => {
      setListLoading(true);
      setListStatus("");

      try {
        const normalizedPageNum = Number(pageNum);
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

        setMarketResult(data.result);
        setListStatus(
          `列表刷新成功：${tabLabel(data.result.tab)}，第 ${data.result.pageNum}/${data.result.totalPage || 1} 页，共 ${fmtCount(
            data.result.totalCount,
          )} 条`,
        );

        const goodsIds = data.result.items.map((item) => item.goodsId);
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
          setValveImpact(null);
          setProImpact(null);
          setDetailStatus("当前筛选条件下没有商品数据。");
        }
      } catch (error) {
        setListStatus(`列表刷新失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setListLoading(false);
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
    void loadMarketList(false);
    void loadValveUpdates();
    void loadProEvents();
  }, [loadMarketList, loadProEvents, loadValveUpdates]);

  const onMarketSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadMarketList(true);
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

  return (
    <main className="shell buff-shell">
      <section className="panel buff-head">
        <div>
          <p className="eyebrow">cs2 buff market explorer</p>
          <h1>CS2 网易 BUFF 市场分析</h1>
          <p className="buff-muted">
            已接入 BUFF 首页列表和商品详情核心接口，支持从列表筛选到单品挂单/成交/走势的一体化查看。
          </p>
        </div>
        <div className="buff-head-actions">
          <a className="hero-link-button" href="/">
            返回分析页
          </a>
          <a className="hero-link-button" href="/source-health">
            数据源健康
          </a>
        </div>
      </section>

      <form className="panel buff-query-form" onSubmit={onMarketSubmit}>
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
            search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="例如 M4A4" />
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

        <div className="buff-action-row">
          <button type="submit" disabled={listLoading || detailLoading}>
            {listLoading ? "列表加载中..." : "刷新列表并拉取详情"}
          </button>
          <button
            type="button"
            disabled={detailLoading || selectedGoodsId === null}
            onClick={() => {
              if (selectedGoodsId !== null) {
                void loadGoodsDashboard(selectedGoodsId);
              }
            }}
          >
            {detailLoading ? "详情加载中..." : "刷新当前商品详情"}
          </button>
          <button type="button" disabled={detailLoading} onClick={() => void runManualGoodsLookup()}>
            按 goods_id 拉取详情
          </button>
        </div>

        {listStatus ? <p className="status">{listStatus}</p> : null}
        {detailStatus ? <p className="status">{detailStatus}</p> : null}
        {valveStatus ? <p className="status">{valveStatus}</p> : null}
        {valveImpactStatus ? <p className="status">{valveImpactStatus}</p> : null}
        {proStatus ? <p className="status">{proStatus}</p> : null}
        {proImpactStatus ? <p className="status">{proImpactStatus}</p> : null}
      </form>

      <section className="grid cols-2 buff-explorer-grid">
        <article className="panel buff-market-panel">
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
          <div className="buff-market-list">
            {marketResult?.items.length ? (
              marketResult.items.map((item) => (
                <button
                  key={item.goodsId}
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
              ))
            ) : (
              <p className="buff-muted">暂无列表数据。</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>商品概览</h2>
            <span>
              {dashboard ? `goods_id=${dashboard.goodsId} · ${fmtTime(dashboard.fetchedAt)}` : "未加载"}
            </span>
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

          <div className="buff-endpoint-grid">
            {(dashboard?.endpointStatus ?? []).map((item) => (
              <article className={endpointStatusClass(item)} key={`${item.key}-${item.endpoint}`}>
                <h3>{item.key}</h3>
                <p>{item.code}</p>
                <p>{item.endpoint}</p>
                {item.error ? <p>{item.error}</p> : null}
              </article>
            ))}
            {!dashboard?.endpointStatus?.length ? <p className="buff-muted">暂无端点状态。</p> : null}
          </div>
        </article>
      </section>

      {dashboard ? (
        <>
          <section className="grid cols-2">
            <article className="panel">
              <h2>主曲线走势</h2>
              {chartData.labels.length ? (
                <PriceChart labels={chartData.labels} values={chartData.values} />
              ) : (
                <p className="buff-muted">暂无可视化点位。</p>
              )}
            </article>
            <article className="panel">
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

          <section className="panel">
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
            <article className="panel">
              <h2>{orderTitle(dashboard.sellOrders?.kind ?? "sell")}</h2>
              {renderOrderPanel(dashboard.sellOrders)}
            </article>
            <article className="panel">
              <h2>{orderTitle(dashboard.buyOrders?.kind ?? "buy")}</h2>
              {renderOrderPanel(dashboard.buyOrders)}
            </article>
            <article className="panel">
              <h2>{orderTitle(dashboard.billOrders?.kind ?? "bill")}</h2>
              {renderOrderPanel(dashboard.billOrders)}
            </article>
          </section>
        </>
      ) : null}

      <section className="grid cols-2 buff-valve-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>V 社官方变更时间线</h2>
            <span>{valveUpdates ? `最近 ${valveUpdates.updates.length} 条 · ${fmtTime(valveUpdates.fetchedAt)}` : "未加载"}</span>
          </div>
          <div className="buff-action-row">
            <button type="button" disabled={valveLoading} onClick={() => void loadValveUpdates()}>
              {valveLoading ? "官方事件加载中..." : "刷新官方事件"}
            </button>
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

        <article className="panel">
          <div className="panel-header">
            <h2>官方变更影响回放</h2>
            <span>
              {selectedGoodsId
                ? `goods_id=${selectedGoodsId} · 价格点 ${fmtCount(valveImpact?.pricePointCount ?? null)}`
                : "请先选择商品"}
            </span>
          </div>

          <div className="buff-action-row">
            <button
              type="button"
              disabled={valveImpactLoading || selectedGoodsId === null}
              onClick={() => {
                if (selectedGoodsId !== null) {
                  void loadValveImpact(selectedGoodsId);
                }
              }}
            >
              {valveImpactLoading ? "影响分析加载中..." : "刷新事件影响回放"}
            </button>
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

      <section className="grid cols-2 buff-pro-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>职业选手事件时间线</h2>
            <span>{proEvents ? `最近 ${proEvents.events.length} 条 · ${fmtTime(proEvents.fetchedAt)}` : "未加载"}</span>
          </div>

          <div className="buff-action-row">
            <button type="button" disabled={proLoading} onClick={() => void loadProEvents()}>
              {proLoading ? "职业事件加载中..." : "刷新职业事件"}
            </button>
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

        <article className="panel">
          <div className="panel-header">
            <h2>职业事件影响回放</h2>
            <span>
              {selectedGoodsId
                ? `goods_id=${selectedGoodsId} · 价格点 ${fmtCount(proImpact?.pricePointCount ?? null)}`
                : "请先选择商品"}
            </span>
          </div>

          <div className="buff-action-row">
            <button
              type="button"
              disabled={proImpactLoading || selectedGoodsId === null}
              onClick={() => {
                if (selectedGoodsId !== null) {
                  void loadProImpact(selectedGoodsId);
                }
              }}
            >
              {proImpactLoading ? "职业影响分析加载中..." : "刷新职业影响回放"}
            </button>
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

      <section className="panel">
        <div className="panel-header">
          <h2>数据源获取方案</h2>
          <span>接口全量落地后，下一步是事件因子和价格行为做联动建模</span>
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

      <section className="panel">
        <div className="panel-header">
          <h2>影响因子映射</h2>
          <span>P0 先上线可量化数据，P1/P2 逐步扩展</span>
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
    </main>
  );
}
