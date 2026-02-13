"use client";

import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import useSWRInfinite from "swr/infinite";

import type { AnalysisRecordMeta, AnalysisResult, MarketSnapshot } from "@/lib/types";

const PriceChart = dynamic(
  () => import("@/components/price-chart").then((m) => m.PriceChart),
  { ssr: false },
);
const MarkdownView = dynamic(
  () => import("@/components/markdown-view").then((m) => m.MarkdownView),
  { ssr: false },
);
const MermaidView = dynamic(
  () => import("@/components/mermaid-view").then((m) => m.MermaidView),
  { ssr: false },
);

const NO_CACHE_HEADERS: HeadersInit = {
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

const fetcher = async (url: string) => {
  const bust = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
  const res = await fetch(bust, { cache: "no-store", headers: NO_CACHE_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const RECORD_PAGE_SIZE = 10;
const FLOW_GRAPH_MERMAID = [
  "graph TD",
  "  MarketAnalyst --> BullResearcher",
  "  FundamentalsAnalyst --> BullResearcher",
  "  NewsAnalyst --> BullResearcher",
  "  SocialAnalyst --> BullResearcher",
  "  MarketAnalyst --> BearResearcher",
  "  FundamentalsAnalyst --> BearResearcher",
  "  NewsAnalyst --> BearResearcher",
  "  SocialAnalyst --> BearResearcher",
  "  BullResearcher --> ResearchManager",
  "  BearResearcher --> ResearchManager",
  "  ResearchManager --> RiskyAnalyst",
  "  ResearchManager --> SafeAnalyst",
  "  ResearchManager --> NeutralAnalyst",
  "  RiskyAnalyst --> RiskJudge",
  "  SafeAnalyst --> RiskJudge",
  "  NeutralAnalyst --> RiskJudge",
].join("\n");

function fmtNum(value: unknown, digits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  return n.toFixed(digits);
}

function fmtPct(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  const v = Math.abs(n) <= 1 ? n * 100 : n;
  return `${v.toFixed(2)}%`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return null;
}

function shorten(text: string, maxLength = 220): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function formatRecordTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getRecordDateKey(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatUtcOffset(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

function resolveSnapshotTimestamp(snapshot: MarketSnapshot): string | null {
  if (typeof snapshot.snapshotAt === "string" && snapshot.snapshotAt.trim()) {
    return snapshot.snapshotAt.trim();
  }
  const latestBarKey = Object.keys(snapshot.recentBars)
    .sort((a, b) => a.localeCompare(b))
    .at(-1);
  if (!latestBarKey) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(latestBarKey)) {
    return `${latestBarKey}T00:00:00.000Z`;
  }
  return latestBarKey;
}

function isDateLevelInterval(interval: string): boolean {
  const normalized = interval.trim().toLowerCase();
  return (
    normalized.endsWith("d") ||
    normalized.endsWith("wk") ||
    normalized.endsWith("w") ||
    normalized.endsWith("mo") ||
    normalized.endsWith("mth")
  );
}

function formatSnapshotTimestamp(snapshot: MarketSnapshot): string {
  const raw = resolveSnapshotTimestamp(snapshot);
  if (!raw) return "N/A";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw;
  if (
    isDateLevelInterval(snapshot.interval) &&
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0
  ) {
    const dayLabel = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    return `${dayLabel}（该周期收盘快照）`;
  }
  const label = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  return `${label} (${formatUtcOffset(date)})`;
}

function stripLegacyRecommendationBlocks(markdown: string): string {
  if (!markdown) return markdown;
  const cleaned = markdown
    .replace(/##\s*最终投资建议（开头）\s*\n-\s*建议:\s*`?(买入|观望|减仓|卖出)`?\s*\n*/gu, "")
    .replace(/##\s*最终投资建议（末尾）\s*\n-\s*建议:\s*`?(买入|观望|减仓|卖出)`?\s*\n*/gu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || markdown;
}

function buildStockIntro(result: AnalysisResult): string {
  const profile = asRecord(asRecord(result.stageBundle.fundamentals.statements).profile);
  const symbolLabel = firstText(profile.securityCode, profile.secuCode, result.symbol) ?? result.symbol;
  const displayName = firstText(profile.securityName, profile.longName, profile.shortName);
  const description = firstText(profile.description, profile.longBusinessSummary);
  const industry = firstText(profile.industry);
  const sector = firstText(profile.sector);
  const exchange = firstText(profile.exchange);
  const currency = firstText(profile.currency);
  const trend = firstText(result.stageBundle.market.technicals.trend);

  const subject = displayName ? `${displayName}（${symbolLabel}）` : symbolLabel;
  if (description) return `${subject}：${shorten(description)}`;

  const details: string[] = [];
  if (sector) details.push(`所属板块为${sector}`);
  if (industry && industry !== sector) details.push(`所属行业为${industry}`);
  if (exchange) details.push(`交易市场为${exchange}`);
  if (currency) details.push(`计价货币为${currency}`);
  if (trend) details.push(`当前技术趋势为${trend}`);

  if (!details.length) {
    return `${subject} 的市场快照已加载，可结合下方指标和价格图进行研判。`;
  }
  return `${subject}，${details.join("，")}。`;
}

function buildStreamStockIntro(snapshot: MarketSnapshot): string {
  const trend = firstText(snapshot.technicals?.trend) ?? "未知";
  const symbolLabel = firstText(snapshot.symbol) ?? "当前股票";
  const cycle = `${snapshot.period}/${snapshot.interval}`;
  return `${symbolLabel} 市场数据已加载（${cycle}），当前技术趋势：${trend}。`;
}

interface DashboardProps {
  initialRecords: AnalysisRecordMeta[];
  initialStorageMode: "vercel_postgres" | "memory";
  initialHasMore: boolean;
}

type RecordsPageResponse = {
  records: AnalysisRecordMeta[];
  storage: "vercel_postgres" | "memory";
  hasMore: boolean;
  nextCursor: number | null;
};

type RecordsApiResponse = {
  ok?: boolean;
  records?: AnalysisRecordMeta[];
  storage?: "vercel_postgres" | "memory";
  hasMore?: boolean;
  nextCursor?: number | null;
};

type AnalyzeProgressPayload = {
  message?: string;
  step?: number;
  totalSteps?: number;
};

type ArtifactType = "analyst" | "debate" | "plan" | "risk" | "snapshot";
type TextArtifactType = Exclude<ArtifactType, "snapshot">;

type AnalyzeArtifactPayload = {
  type?: "artifact";
  artifactType?: ArtifactType;
  title?: string;
  markdown?: string;
  payload?: unknown;
  snapshotType?: "market";
  key?: "market" | "fundamentals" | "news" | "social";
  roundId?: number;
  side?: "bull" | "bear" | "risky" | "safe" | "neutral" | "judge";
};

type AnalyzeErrorResponse = {
  ok?: false;
  error?: string;
  storage?: "vercel_postgres" | "memory";
};

type ParsedSseFrame = {
  event: string;
  data: unknown;
};

type AnalystArtifactKey = "market" | "fundamentals" | "news" | "social";

type RiskArtifactSide = "risky" | "safe" | "neutral" | "judge";

type StreamDebateState = {
  bullMarkdown?: string;
  bearMarkdown?: string;
};

type StreamCardsState = {
  analystReports: Partial<Record<AnalystArtifactKey, string>>;
  preliminaryPlan: string | null;
  riskReports: Partial<Record<RiskArtifactSide, string>>;
  debates: Record<number, StreamDebateState>;
  marketSnapshot: MarketSnapshot | null;
};

type StreamDebateTurn = {
  roundId: number;
  bullMarkdown?: string;
  bearMarkdown?: string;
};

type RenderDebateTurn = {
  roundId: number;
  bullMarkdown?: string;
  bearMarkdown?: string;
};

type ArtifactUpdatePayload =
  | {
    artifactType: "snapshot";
    marketSnapshot: MarketSnapshot;
  }
  | {
    artifactType: TextArtifactType;
    markdown: string;
    key?: AnalyzeArtifactPayload["key"];
    roundId?: number;
    side?: AnalyzeArtifactPayload["side"];
  };

type QuickJumpTarget = {
  id: string;
  label: string;
};

function createEmptyStreamCardsState(): StreamCardsState {
  return {
    analystReports: {},
    preliminaryPlan: null,
    riskReports: {},
    debates: {},
    marketSnapshot: null,
  };
}

function toMarketSnapshot(value: unknown): MarketSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<MarketSnapshot>;
  if (typeof snapshot.symbol !== "string") return null;
  if (!snapshot.technicals || typeof snapshot.technicals !== "object") return null;
  if (typeof snapshot.period !== "string" || typeof snapshot.interval !== "string") return null;
  const recentBars =
    snapshot.recentBars && typeof snapshot.recentBars === "object"
      ? (snapshot.recentBars as MarketSnapshot["recentBars"])
      : {};
  return {
    symbol: snapshot.symbol,
    period: snapshot.period,
    interval: snapshot.interval,
    points: Number.isFinite(Number(snapshot.points)) ? Number(snapshot.points) : 0,
    snapshotAt: typeof snapshot.snapshotAt === "string" ? snapshot.snapshotAt : null,
    technicals: snapshot.technicals as MarketSnapshot["technicals"],
    recentBars,
    error: typeof snapshot.error === "string" ? snapshot.error : undefined,
  };
}

function toArtifactUpdate(data: unknown): ArtifactUpdatePayload | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as AnalyzeArtifactPayload;
  if (!payload.artifactType) return null;

  if (payload.artifactType === "snapshot") {
    if (payload.snapshotType !== "market") return null;
    const marketSnapshot = toMarketSnapshot(payload.payload);
    if (!marketSnapshot) return null;
    return {
      artifactType: "snapshot",
      marketSnapshot,
    };
  }

  if (!payload.markdown || typeof payload.markdown !== "string") return null;
  const markdown = payload.markdown.trim();
  if (!markdown) return null;
  return {
    artifactType: payload.artifactType as TextArtifactType,
    markdown,
    key: payload.key,
    roundId: payload.roundId,
    side: payload.side,
  };
}

function applyArtifactUpdate(prev: StreamCardsState, payload: ArtifactUpdatePayload): StreamCardsState {
  const next: StreamCardsState = {
    analystReports: { ...prev.analystReports },
    preliminaryPlan: prev.preliminaryPlan,
    riskReports: { ...prev.riskReports },
    debates: { ...prev.debates },
    marketSnapshot: prev.marketSnapshot,
  };

  if (payload.artifactType === "snapshot") {
    next.marketSnapshot = payload.marketSnapshot;
    return next;
  }

  if (payload.artifactType === "analyst") {
    const key = payload.key;
    if (key === "market" || key === "fundamentals" || key === "news" || key === "social") {
      next.analystReports[key] = payload.markdown;
    }
    return next;
  }

  if (payload.artifactType === "plan") {
    next.preliminaryPlan = payload.markdown;
    return next;
  }

  if (payload.artifactType === "risk") {
    const side = payload.side;
    if (side === "risky" || side === "safe" || side === "neutral" || side === "judge") {
      next.riskReports[side] = payload.markdown;
    }
    return next;
  }

  if (payload.artifactType === "debate") {
    const roundId = Number(payload.roundId);
    if (!Number.isInteger(roundId) || roundId <= 0) return next;
    const current = next.debates[roundId] ?? {};
    if (payload.side === "bull") {
      next.debates[roundId] = { ...current, bullMarkdown: payload.markdown };
    } else if (payload.side === "bear") {
      next.debates[roundId] = { ...current, bearMarkdown: payload.markdown };
    }
    return next;
  }

  return next;
}

function parseSseFrame(frame: string): ParsedSseFrame | null {
  const lines = frame.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return null;
  const rawData = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: { message: rawData } };
  }
}

function toProgressText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as AnalyzeProgressPayload;
  if (!payload.message) return null;
  const step = Number(payload.step);
  const total = Number(payload.totalSteps);
  if (Number.isFinite(step) && Number.isFinite(total) && step > 0 && total > 0) {
    return `[${step}/${total}] ${payload.message}`;
  }
  return payload.message;
}

async function readErrorMessage(response: Response): Promise<string> {
  const raw = await response.text();
  if (!raw) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch { }
  return raw;
}

export function AnalysisDashboard({
  initialRecords,
  initialStorageMode,
  initialHasMore,
}: DashboardProps) {
  const [symbol, setSymbol] = useState("");
  const [analysisMode, setAnalysisMode] = useState<"quick" | "standard" | "deep">("standard");
  const [debateRounds, setDebateRounds] = useState("");
  const [period, setPeriod] = useState("6mo");
  const [interval, setInterval] = useState("1d");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState("");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [streamCards, setStreamCards] = useState<StreamCardsState>(() => createEmptyStreamCardsState());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [storageMode, setStorageMode] = useState<"vercel_postgres" | "memory">(initialStorageMode);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const recordListRef = useRef<HTMLDivElement | null>(null);
  const statusLogRef = useRef<HTMLDivElement | null>(null);

  const initialPage: RecordsPageResponse = {
    records: initialRecords,
    storage: initialStorageMode,
    hasMore: initialHasMore,
    nextCursor: initialHasMore && initialRecords.length ? initialRecords[initialRecords.length - 1]?.id ?? null : null,
  };

  const {
    data: recordPages,
    size,
    setSize,
    mutate: mutateRecords,
    isValidating: isValidatingRecords,
  } = useSWRInfinite<RecordsPageResponse>(
    (pageIndex, previousPageData) => {
      if (pageIndex === 0) return `/api/records?limit=${RECORD_PAGE_SIZE}`;
      if (!previousPageData?.hasMore || !previousPageData.nextCursor) return null;
      return `/api/records?limit=${RECORD_PAGE_SIZE}&cursor=${previousPageData.nextCursor}`;
    },
    fetcher,
    {
      fallbackData: [initialPage],
      revalidateFirstPage: true,
      revalidateOnFocus: false,
    },
  );

  const pages = recordPages ?? [initialPage];
  const records = pages.flatMap((page) => page.records);
  const recordsHasMore = pages[pages.length - 1]?.hasMore ?? false;
  const isLoadingMoreRecords = isValidatingRecords && size > pages.length;
  const displayedMarketSnapshot = result?.stageBundle.market ?? streamCards.marketSnapshot;

  const chartData = useMemo(() => {
    const bars = displayedMarketSnapshot?.recentBars ?? {};
    const entries = Object.entries(bars).sort((a, b) => a[0].localeCompare(b[0]));
    return {
      labels: entries.map(([k]) => k),
      values: entries.map(([, v]) => Number(v.Close ?? 0)),
    };
  }, [displayedMarketSnapshot]);

  const stockIntro = useMemo(() => {
    if (result) return buildStockIntro(result);
    if (displayedMarketSnapshot) return buildStreamStockIntro(displayedMarketSnapshot);
    return null;
  }, [displayedMarketSnapshot, result]);

  const snapshotTimeLabel = useMemo(() => {
    if (!displayedMarketSnapshot) return null;
    return formatSnapshotTimestamp(displayedMarketSnapshot);
  }, [displayedMarketSnapshot]);

  const streamDebates = useMemo<StreamDebateTurn[]>(() => {
    return Object.entries(streamCards.debates)
      .map(([round, value]) => ({
        roundId: Number(round),
        bullMarkdown: value.bullMarkdown,
        bearMarkdown: value.bearMarkdown,
      }))
      .filter((turn) => Number.isInteger(turn.roundId) && turn.roundId > 0)
      .sort((a, b) => a.roundId - b.roundId);
  }, [streamCards.debates]);

  const displayedDebates = useMemo<RenderDebateTurn[]>(() => {
    if (result) {
      return result.debates.map((turn) => ({
        roundId: turn.roundId,
        bullMarkdown: turn.bullMarkdown,
        bearMarkdown: turn.bearMarkdown,
      }));
    }
    return streamDebates;
  }, [result, streamDebates]);

  const marketReportMarkdown = result?.analystReports.market.markdown ?? streamCards.analystReports.market ?? "";
  const fundamentalsReportMarkdown =
    result?.analystReports.fundamentals.markdown ?? streamCards.analystReports.fundamentals ?? "";
  const newsReportMarkdown = result?.analystReports.news.markdown ?? streamCards.analystReports.news ?? "";
  const socialReportMarkdown = result?.analystReports.social.markdown ?? streamCards.analystReports.social ?? "";
  const preliminaryPlanMarkdown = result?.preliminaryPlan ?? streamCards.preliminaryPlan ?? "";
  const riskyMarkdown = result?.riskReports.risky ?? streamCards.riskReports.risky ?? "";
  const safeMarkdown = result?.riskReports.safe ?? streamCards.riskReports.safe ?? "";
  const neutralMarkdown = result?.riskReports.neutral ?? streamCards.riskReports.neutral ?? "";
  const rawJudgeMarkdown = result?.riskReports.judge ?? streamCards.riskReports.judge ?? "";
  const judgeMarkdown = useMemo(
    () => stripLegacyRecommendationBlocks(rawJudgeMarkdown),
    [rawJudgeMarkdown],
  );

  const streamHasContent = useMemo(() => {
    return Boolean(
      marketReportMarkdown ||
      fundamentalsReportMarkdown ||
      newsReportMarkdown ||
      socialReportMarkdown ||
      preliminaryPlanMarkdown ||
      riskyMarkdown ||
      safeMarkdown ||
      neutralMarkdown ||
      judgeMarkdown ||
      displayedDebates.length ||
      Boolean(displayedMarketSnapshot),
    );
  }, [
    marketReportMarkdown,
    fundamentalsReportMarkdown,
    newsReportMarkdown,
    socialReportMarkdown,
    preliminaryPlanMarkdown,
    riskyMarkdown,
    safeMarkdown,
    neutralMarkdown,
    judgeMarkdown,
    displayedDebates.length,
    displayedMarketSnapshot,
  ]);

  const showAnalysisPanels = Boolean(result || isAnalyzing || streamHasContent);

  const quickJumpTargets = useMemo<QuickJumpTarget[]>(() => {
    const targets: QuickJumpTarget[] = [];
    if (!showAnalysisPanels) return targets;
    targets.push(
      { id: "section-market-snapshot", label: "市场快照" },
      { id: "section-preliminary-plan", label: "交易计划" },
      { id: "section-analysts", label: "四位分析师" },
      { id: "section-debates", label: "多空辩论" },
    );
    for (const turn of displayedDebates) {
      targets.push({
        id: `section-debate-round-${turn.roundId}`,
        label: `第 ${turn.roundId} 轮辩论`,
      });
    }
    targets.push({ id: "section-risk", label: "风控内阁" });
    return targets;
  }, [showAnalysisPanels, displayedDebates]);

  useEffect(() => {
    if (!isSidebarOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (sidebarRef.current?.contains(target)) return;
      if (sidebarToggleRef.current?.contains(target)) return;
      setIsSidebarOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isSidebarOpen]);

  function pushStatusLine(line: string) {
    setStatus(line);
    setStatusLog((prev) => {
      if (prev[prev.length - 1] === line) return prev;
      return [...prev, line].slice(-8);
    });
  }

  function jumpToSection(targetId: string) {
    const element = document.getElementById(targetId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const loadMoreRecords = useCallback(() => {
    if (!recordsHasMore || isLoadingMoreRecords) return;
    void setSize((current) => current + 1);
  }, [isLoadingMoreRecords, recordsHasMore, setSize]);

  function onRecordListScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 80;
    if (nearBottom) loadMoreRecords();
  }

  useEffect(() => {
    if (!isSidebarOpen || !recordsHasMore || isLoadingMoreRecords) return;
    const element = recordListRef.current;
    if (!element) return;

    const rafId = window.requestAnimationFrame(() => {
      if (element.scrollHeight <= element.clientHeight + 2) {
        loadMoreRecords();
      }
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isSidebarOpen, records.length, recordsHasMore, isLoadingMoreRecords, loadMoreRecords]);

  useEffect(() => {
    const element = statusLogRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [statusLog]);

  async function refreshLatestRecords(seed?: number): Promise<void> {
    const nonce = Number.isFinite(seed) ? String(seed) : Date.now().toString();
    const response = await fetch(`/api/records?limit=${RECORD_PAGE_SIZE}&_=${encodeURIComponent(nonce)}`, {
      cache: "no-store",
      headers: NO_CACHE_HEADERS,
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    const raw = (await response.json()) as RecordsApiResponse;
    const nextPage: RecordsPageResponse = {
      records: Array.isArray(raw.records) ? raw.records : [],
      storage: raw.storage === "memory" ? "memory" : "vercel_postgres",
      hasMore: Boolean(raw.hasMore),
      nextCursor: typeof raw.nextCursor === "number" && Number.isInteger(raw.nextCursor) ? raw.nextCursor : null,
    };
    await mutateRecords([nextPage], { revalidate: false });
    await setSize(1);
  }

  async function runAnalysis() {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      pushStatusLine("请输入股票代码");
      return;
    }

    setIsAnalyzing(true);
    setStatusLog([]);
    setStreamCards(createEmptyStreamCardsState());
    setResult(null);
    pushStatusLine("正在建立流式连接...");

    const payload: Record<string, unknown> = {
      symbol: normalizedSymbol,
      analysisMode,
      period: period.trim(),
      interval: interval.trim(),
    };
    if (debateRounds.trim()) payload.debateRounds = Number(debateRounds.trim());

    try {
      const response = await fetch("/api/analyze/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      if (!response.body) {
        throw new Error("当前环境不支持流式读取响应体");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let donePayload: Record<string, unknown> | null = null;

      const consumeFrame = (frame: string): Record<string, unknown> | null => {
        const parsed = parseSseFrame(frame);
        if (!parsed || parsed.event === "ping" || parsed.event === "end") return null;

        if (parsed.event === "status" || parsed.event === "progress") {
          const line = toProgressText(parsed.data);
          if (line) pushStatusLine(line);
          return null;
        }

        if (parsed.event === "artifact") {
          const artifact = toArtifactUpdate(parsed.data);
          if (artifact) {
            setStreamCards((prev) => applyArtifactUpdate(prev, artifact));
          }
          return null;
        }

        if (parsed.event === "done") {
          if (!parsed.data || typeof parsed.data !== "object") {
            throw new Error("分析完成事件格式不正确");
          }
          return parsed.data as Record<string, unknown>;
        }

        if (parsed.event === "error") {
          const errorPayload = parsed.data as AnalyzeErrorResponse;
          throw new Error(errorPayload.error ?? "分析失败");
        }
        return null;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const parsedDone = consumeFrame(frame);
          if (parsedDone) donePayload = parsedDone;
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const frame of buffer.split("\n\n")) {
          if (!frame.trim()) continue;
          const parsedDone = consumeFrame(frame);
          if (parsedDone) donePayload = parsedDone;
        }
      }

      if (!donePayload) {
        throw new Error("分析中断：未收到最终结果");
      }

      const finalResult = donePayload.result as AnalysisResult | undefined;
      if (!finalResult || typeof finalResult !== "object") {
        throw new Error("分析中断：返回结果为空");
      }

      const finalStorage = donePayload.storage === "memory" ? "memory" : "vercel_postgres";
      const finalRecordId = Number(donePayload.recordId);
      if (!Number.isInteger(finalRecordId) || finalRecordId <= 0) {
        throw new Error("分析中断：返回记录 ID 非法");
      }

      setResult(finalResult);
      setStorageMode(finalStorage);
      pushStatusLine(`分析完成，记录 ID: ${finalRecordId}`);

      try {
        await refreshLatestRecords(finalRecordId);
      } catch (refreshError) {
        pushStatusLine(`记录刷新失败，回退到默认刷新: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`);
        await setSize(1);
        await mutateRecords();
      }
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function loadRecord(id: number) {
    pushStatusLine(`正在加载记录 #${id} ...`);
    setStreamCards(createEmptyStreamCardsState());
    const response = await fetch(`/api/records/${id}`, {
      cache: "no-store",
      headers: NO_CACHE_HEADERS,
    });
    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.error ?? `HTTP ${response.status}`);
    }
    setResult(json.record.result);
    pushStatusLine(`已加载记录 #${id}`);
  }

  return (
    <main className="shell">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />

      <div className="dashboard-layout">
        <aside
          ref={sidebarRef}
          className={`panel records-sidebar records-drawer${isSidebarOpen ? " is-open" : ""}`}
          id="records-drawer"
          aria-hidden={!isSidebarOpen}
        >
          <div className="panel-header records-sidebar-header">
            <h2>分析记录</h2>
            <span className="records-sidebar-meta">
              {records.length} 条{recordsHasMore ? " · 下滑加载" : ""}
            </span>
          </div>
          <div
            ref={recordListRef}
            className="record-list records-scroll"
            id="records-scroll"
            onScroll={onRecordListScroll}
          >
            {records.map((record, index) => {
              const currentDateKey = getRecordDateKey(record.createdAt);
              const previousDateKey = index > 0 ? getRecordDateKey(records[index - 1].createdAt) : null;
              const startsNewDateGroup = index === 0 || previousDateKey !== currentDateKey;

              return (
                <Fragment key={record.id}>
                  {startsNewDateGroup ? (
                    <div
                      className={`record-date-divider${index === 0 ? " record-date-divider-first" : ""}`}
                      role="separator"
                      aria-label={`日期 ${currentDateKey}`}
                    >
                      <span>{currentDateKey}</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="record-item"
                    onClick={() => {
                      if (window.matchMedia("(max-width: 1080px)").matches) {
                        setIsSidebarOpen(false);
                      }
                      loadRecord(record.id).catch((err) =>
                        pushStatusLine(`加载失败: ${err instanceof Error ? err.message : String(err)}`),
                      );
                    }}
                  >
                    <div className="record-item-main">
                      <div className="record-item-symbol-row">
                        <strong>{record.symbol}</strong>
                        <small className="record-item-id">#{record.id}</small>
                      </div>
                      <span className="record-item-sub">
                        {record.analysisMode} · {record.debateRounds} 轮
                      </span>
                    </div>
                    <div className="record-item-side">
                      <em>{record.recommendation ?? "-"}</em>
                      <small>{formatRecordTimestamp(record.createdAt)}</small>
                    </div>
                  </button>
                </Fragment>
              );
            })}
            {!records.length ? <div className="empty-state">暂无记录</div> : null}
            {isLoadingMoreRecords ? <div className="empty-state">加载更多中...</div> : null}
            {!recordsHasMore && records.length ? <div className="empty-state">已加载全部记录</div> : null}
          </div>
        </aside>
        <button
          ref={sidebarToggleRef}
          type="button"
          className={`records-drawer-toggle${isSidebarOpen ? " is-open" : ""}`}
          aria-expanded={isSidebarOpen}
          aria-controls="records-drawer"
          onClick={() => setIsSidebarOpen((prev) => !prev)}
        >
          {isSidebarOpen ? "收起记录" : "展开记录"}
        </button>
        {isSidebarOpen ? (
          <button
            type="button"
            className="records-drawer-backdrop"
            aria-label="关闭记录侧边栏"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}

        <div className="dashboard-main">
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">tradins on next.js + vercel</p>
              <h1>Tradins 金融分析 Agengs-Team</h1>
              <p>
                四位分析师并行研究，随后多空辩论、研究主管决策、风控内阁裁定。所有分析记录可持久化到
                Vercel Postgres。
              </p>
              <p className="storage-tag">
                当前存储: <strong>{storageMode}</strong>
              </p>
              <div className="hero-flow">
                <h2>数据流图</h2>
                <MermaidView code={FLOW_GRAPH_MERMAID} />
              </div>
            </div>

            <form
              className="panel form-panel"
              onSubmit={(e) => {
                e.preventDefault();
                runAnalysis().catch((err) => {
                  const message = `分析失败: ${err instanceof Error ? err.message : String(err)}`;
                  pushStatusLine(message);
                });
              }}
            >
              <label>
                股票代码
                <input
                  name="symbol"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputMode="text"
                  required
                  maxLength={20}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="美股: AAPL / A股: 688256 / 黄金: GOLD / 白银: SILVER"
                />
              </label>
              <label>
                分析模式
                <select
                  name="analysisMode"
                  value={analysisMode}
                  onChange={(e) => setAnalysisMode(e.target.value as "quick" | "standard" | "deep")}
                >
                  <option value="quick">quick</option>
                  <option value="standard">standard</option>
                  <option value="deep">deep</option>
                </select>
              </label>
              <label>
                辩论轮次（留空走模式默认）
                <input
                  name="debateRounds"
                  type="number"
                  min={1}
                  max={10}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={debateRounds}
                  onChange={(e) => setDebateRounds(e.target.value)}
                  placeholder="1-10"
                />
              </label>
              <label>
                K线周期
                <input
                  name="period"
                  autoComplete="off"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              </label>
              <label>
                K线粒度
                <input
                  name="interval"
                  autoComplete="off"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                />
              </label>
              <button type="submit" disabled={isAnalyzing || !symbol.trim()}>
                {isAnalyzing ? "分析中..." : "开始分析"}
              </button>
              <p className="status" aria-live="polite">
                {status}
              </p>
              {statusLog.length ? (
                <div className="status-log" ref={statusLogRef}>
                  {statusLog.map((line, index) => (
                    <p key={`${index}-${line}`}>{line}</p>
                  ))}
                </div>
              ) : null}
            </form>
          </section>

          {showAnalysisPanels ? (
            <>
              <section className="grid cols-2">
                <article className="panel anchor-target" id="section-market-snapshot">
                  <h2>市场快照</h2>
                  {snapshotTimeLabel ? <p className="snapshot-time">快照时间：{snapshotTimeLabel}</p> : null}
                  {displayedMarketSnapshot ? (
                    <>
                      {stockIntro ? (
                        <div className="stock-intro">
                          <h3>股票简介</h3>
                          <p>{stockIntro}</p>
                        </div>
                      ) : null}
                      <div className="metric-grid">
                        <div className="metric">
                          <span>现价</span>
                          <strong>{fmtNum(displayedMarketSnapshot.technicals.price)}</strong>
                        </div>
                        <div className="metric">
                          <span>1日涨跌</span>
                          <strong>{fmtPct(displayedMarketSnapshot.technicals.changePct1d)}</strong>
                        </div>
                        <div className="metric">
                          <span>RSI14</span>
                          <strong>{fmtNum(displayedMarketSnapshot.technicals.rsi14)}</strong>
                        </div>
                        <div className="metric">
                          <span>量比20d</span>
                          <strong>{fmtNum(displayedMarketSnapshot.technicals.volumeRatio20d)}</strong>
                        </div>
                      </div>
                      <PriceChart labels={chartData.labels} values={chartData.values} />
                    </>
                  ) : (
                    <div className="empty-state">
                      {isAnalyzing
                        ? `${symbol.trim().toUpperCase() || "当前股票"} 市场数据采集中，完成后会展示指标与价格图。`
                        : "先运行一次分析"}
                    </div>
                  )}
                </article>

                <article className="panel anchor-target" id="section-preliminary-plan">
                  <h2>研究主管初步交易计划</h2>
                  {preliminaryPlanMarkdown ? (
                    <MarkdownView markdown={preliminaryPlanMarkdown} />
                  ) : (
                    <div className="empty-state">
                      {isAnalyzing ? "研究主管正在汇总四位分析师观点..." : "等待交易计划"}
                    </div>
                  )}
                </article>
              </section>

              <section className="panel anchor-target" id="section-analysts">
                <h2>四位分析师</h2>
                <div className="card-grid">
                  <div className="card">
                    <h3>📈 市场分析师</h3>
                    {marketReportMarkdown ? (
                      <MarkdownView markdown={marketReportMarkdown} />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "市场分析师正在生成中..." : "等待内容"}</div>
                    )}
                  </div>
                  <div className="card">
                    <h3>📊 基本面分析师</h3>
                    {fundamentalsReportMarkdown ? (
                      <MarkdownView markdown={fundamentalsReportMarkdown} />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "基本面分析师正在生成中..." : "等待内容"}</div>
                    )}
                  </div>
                  <div className="card">
                    <h3>📰 新闻分析师</h3>
                    {newsReportMarkdown ? (
                      <MarkdownView markdown={newsReportMarkdown} />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "新闻分析师正在生成中..." : "等待内容"}</div>
                    )}
                  </div>
                  <div className="card">
                    <h3>🗣️ 舆情分析师</h3>
                    {socialReportMarkdown ? (
                      <MarkdownView markdown={socialReportMarkdown} />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "舆情分析师正在生成中..." : "等待内容"}</div>
                    )}
                  </div>
                </div>
              </section>

              <section className="panel anchor-target" id="section-debates">
                <h2>多空辩论</h2>
                {displayedDebates.length ? (
                  <div className="timeline">
                    {displayedDebates.map((turn) => (
                      <article
                        className="turn anchor-target"
                        id={`section-debate-round-${turn.roundId}`}
                        key={turn.roundId}
                      >
                        <span className="badge">第 {turn.roundId} 轮</span>
                        <div className="grid cols-2">
                          <div className="card">
                            <h3>🐂 多头</h3>
                            {turn.bullMarkdown ? (
                              <MarkdownView markdown={turn.bullMarkdown} />
                            ) : (
                              <div className="empty-state">多头观点生成中...</div>
                            )}
                          </div>
                          <div className="card">
                            <h3>🐻 空头</h3>
                            {turn.bearMarkdown ? (
                              <MarkdownView markdown={turn.bearMarkdown} />
                            ) : (
                              <div className="empty-state">空头观点生成中...</div>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">{isAnalyzing ? "多空辩论尚未开始" : "暂无辩论记录"}</div>
                )}
              </section>

              <section className="panel anchor-target" id="section-risk">
                <h2>风控内阁与最终裁定</h2>
                <div className="card-grid triple">
                  <div className="card">
                    <h3>🚨 激进派</h3>
                    {riskyMarkdown ? (
                      <MarkdownView markdown={riskyMarkdown} />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "激进派评估中..." : "等待内容"}</div>
                    )}
                  </div>
                  <div className="card">
                    <h3>🛡️ 保守派</h3>
                    {safeMarkdown ? (
                      <MarkdownView markdown={safeMarkdown} />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "保守派评估中..." : "等待内容"}</div>
                    )}
                  </div>
                  <div className="card">
                    <h3>⚖️ 中立派</h3>
                    {neutralMarkdown ? (
                      <MarkdownView markdown={neutralMarkdown} />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "中立派评估中..." : "等待内容"}</div>
                    )}
                  </div>
                </div>
                <div className="judge-box">
                  <h3>风控法官</h3>
                  {judgeMarkdown ? (
                    <MarkdownView markdown={judgeMarkdown} />
                  ) : (
                    <div className="empty-state">{isAnalyzing ? "法官裁定生成中..." : "等待裁定"}</div>
                  )}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>

      <nav className="quick-nav-dock" role="navigation" aria-label="分析区块快速定位">
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
