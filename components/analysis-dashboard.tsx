"use client";

import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import useSWRInfinite from "swr/infinite";

import type { AnalysisRecordMeta, AnalysisResult, MarketSnapshot, NewsItem, RecommendationCalibration } from "@/lib/types";

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
const SentimentGauge = dynamic(
  () => import("@/components/sentiment-gauge").then((m) => m.SentimentGauge),
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
const REPO_URL = "https://github.com/5unnyWind/tradins";
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

type SectionIconName =
  | "market"
  | "fundamentals"
  | "news"
  | "social"
  | "bull"
  | "bear"
  | "risky"
  | "safe"
  | "neutral";

function SectionTitle({ icon, label }: { icon: SectionIconName; label: string }) {
  return (
    <h3 className="card-title">
      <span className={`title-icon title-icon-${icon}`} aria-hidden="true">
        {renderSectionIcon(icon)}
      </span>
      <span>{label}</span>
    </h3>
  );
}

function renderSectionIcon(icon: SectionIconName) {
  if (icon === "market") {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path fill="currentColor" d="M4 18h16v2H2V4h2v14Zm2-2 4.6-4.6 3 3L20 8l1.4 1.4-7.8 7.8-3-3L7.4 17.4 6 16Z" />
      </svg>
    );
  }
  if (icon === "fundamentals") {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path fill="currentColor" d="M4 3h2v18H4V3Zm7 6h2v12h-2V9Zm7-4h2v16h-2V5Z" />
      </svg>
    );
  }
  if (icon === "news") {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path fill="currentColor" d="M4 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Zm2 3v2h5V8H6Zm0 4v2h12v-2H6Z" />
      </svg>
    );
  }
  if (icon === "social") {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 5v2h7V9H6Zm0 4v2h11v-2H6Z" />
      </svg>
    );
  }
  if (icon === "bull") {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path fill="currentColor" d="M12 2 4 10h5v10h6V10h5L12 2Zm0 16V8.8l2.8 2.8 1.4-1.4L12 6 7.8 10.2l1.4 1.4L12 8.8V18Z" />
      </svg>
    );
  }
  if (icon === "bear") {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path fill="currentColor" d="m12 22 8-8h-5V4H9v10H4l8 8Zm0-16v9.2l-2.8-2.8-1.4 1.4L12 18l4.2-4.2-1.4-1.4-2.8 2.8V6Z" />
      </svg>
    );
  }
  if (icon === "risky") {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path fill="currentColor" d="M12 2 1 21h22L12 2Zm1 14h-2v2h2v-2Zm0-6h-2v5h2V10Z" />
      </svg>
    );
  }
  if (icon === "safe") {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path fill="currentColor" d="M12 2 4 5v6c0 5.5 3.8 10.6 8 12 4.2-1.4 8-6.5 8-12V5l-8-3Zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path fill="currentColor" d="M7 5h2v14H7V5Zm8 0h2v14h-2V5Zm-5 2h4v2h-4V7Zm0 8h4v2h-4v-2Z" />
    </svg>
  );
}

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

function confidenceLevelText(level: RecommendationCalibration["confidenceLevel"]): string {
  if (level === "high") return "高";
  if (level === "medium") return "中";
  return "低";
}

function toSentimentGaugeScore(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round((value + 1) * 50)));
}

function sentimentGaugeLabel(score: number | null): string {
  if (score === null) return "暂无信号";
  if (score >= 80) return "偏贪婪";
  if (score >= 60) return "乐观";
  if (score >= 40) return "中性";
  if (score >= 20) return "谨慎";
  return "偏恐惧";
}

function formatNewsTimestamp(value: string | null): string {
  if (!value) return "时间未知";
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
  snapshotType?: "market" | "news" | "social";
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

type StreamNewsSnapshot = Pick<AnalysisResult["stageBundle"]["news"], "avgSentiment" | "items">;

type StreamSocialSnapshot = Pick<AnalysisResult["stageBundle"]["social"], "avgSentiment">;

type StreamCardsState = {
  analystReports: Partial<Record<AnalystArtifactKey, string>>;
  preliminaryPlan: string | null;
  riskReports: Partial<Record<RiskArtifactSide, string>>;
  debates: Record<number, StreamDebateState>;
  marketSnapshot: MarketSnapshot | null;
  newsSnapshot: StreamNewsSnapshot | null;
  socialSnapshot: StreamSocialSnapshot | null;
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
    snapshotType: "market";
    marketSnapshot: MarketSnapshot;
  }
  | {
    artifactType: "snapshot";
    snapshotType: "news";
    newsSnapshot: StreamNewsSnapshot;
  }
  | {
    artifactType: "snapshot";
    snapshotType: "social";
    socialSnapshot: StreamSocialSnapshot;
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
    newsSnapshot: null,
    socialSnapshot: null,
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

function toNewsItem(value: unknown): NewsItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<NewsItem>;
  if (typeof item.title !== "string" || typeof item.summary !== "string") return null;
  const sentimentScore = Number(item.sentiment?.score);
  const sentimentLabel = item.sentiment?.label;
  if (!Number.isFinite(sentimentScore)) return null;
  if (sentimentLabel !== "positive" && sentimentLabel !== "negative" && sentimentLabel !== "neutral") return null;
  return {
    title: item.title,
    summary: item.summary,
    publisher: typeof item.publisher === "string" ? item.publisher : null,
    publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null,
    link: typeof item.link === "string" ? item.link : null,
    sentiment: {
      score: sentimentScore,
      label: sentimentLabel,
    },
  };
}

function toNewsSnapshot(value: unknown): StreamNewsSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<AnalysisResult["stageBundle"]["news"]>;
  const avgSentiment = Number(snapshot.avgSentiment);
  if (!Number.isFinite(avgSentiment)) return null;
  const items = Array.isArray(snapshot.items)
    ? snapshot.items.map((item) => toNewsItem(item)).filter((item): item is NewsItem => item !== null)
    : [];
  return {
    avgSentiment,
    items,
  };
}

function toSocialSnapshot(value: unknown): StreamSocialSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<AnalysisResult["stageBundle"]["social"]>;
  const avgSentiment = Number(snapshot.avgSentiment);
  if (!Number.isFinite(avgSentiment)) return null;
  return {
    avgSentiment,
  };
}

function toArtifactUpdate(data: unknown): ArtifactUpdatePayload | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as AnalyzeArtifactPayload;
  if (!payload.artifactType) return null;

  if (payload.artifactType === "snapshot") {
    if (payload.snapshotType === "market") {
      const marketSnapshot = toMarketSnapshot(payload.payload);
      if (!marketSnapshot) return null;
      return {
        artifactType: "snapshot",
        snapshotType: "market",
        marketSnapshot,
      };
    }
    if (payload.snapshotType === "news") {
      const newsSnapshot = toNewsSnapshot(payload.payload);
      if (!newsSnapshot) return null;
      return {
        artifactType: "snapshot",
        snapshotType: "news",
        newsSnapshot,
      };
    }
    if (payload.snapshotType === "social") {
      const socialSnapshot = toSocialSnapshot(payload.payload);
      if (!socialSnapshot) return null;
      return {
        artifactType: "snapshot",
        snapshotType: "social",
        socialSnapshot,
      };
    }
    return null;
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
    newsSnapshot: prev.newsSnapshot,
    socialSnapshot: prev.socialSnapshot,
  };

  if (payload.artifactType === "snapshot") {
    if (payload.snapshotType === "market") {
      next.marketSnapshot = payload.marketSnapshot;
    } else if (payload.snapshotType === "news") {
      next.newsSnapshot = payload.newsSnapshot;
    } else if (payload.snapshotType === "social") {
      next.socialSnapshot = payload.socialSnapshot;
    }
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

function progressFromStatus(status: string, isAnalyzing: boolean, hasResult: boolean): { percent: number; text: string } {
  if (hasResult) return { percent: 100, text: "分析完成" };
  const text = status.trim();
  const stepMatch = text.match(/\[(\d+)\/(\d+)\]/);
  if (stepMatch) {
    const step = Number(stepMatch[1]);
    const total = Number(stepMatch[2]);
    if (Number.isFinite(step) && Number.isFinite(total) && total > 0) {
      const percent = Math.max(8, Math.min(96, Math.round((step / total) * 100)));
      const label = text.replace(/^\[\d+\/\d+\]\s*/, "") || "分析进行中";
      return { percent, text: label };
    }
  }

  const hints: Array<{ keywords: string[]; percent: number; text: string }> = [
    { keywords: ["建立流式连接", "连接"], percent: 8, text: "正在建立连接" },
    { keywords: ["采集", "快照", "数据"], percent: 22, text: "正在采集多源数据" },
    { keywords: ["分析师", "并行研判"], percent: 44, text: "四位分析师并行研判" },
    { keywords: ["辩论", "多空"], percent: 62, text: "多空辩论中" },
    { keywords: ["交易计划", "经理"], percent: 74, text: "生成交易计划" },
    { keywords: ["风控", "内阁", "裁定"], percent: 86, text: "风控内阁审议中" },
    { keywords: ["收尾", "完成"], percent: 96, text: "收尾中" },
  ];
  for (const hint of hints) {
    if (hint.keywords.some((k) => text.includes(k))) return { percent: hint.percent, text: hint.text };
  }

  if (isAnalyzing) return { percent: 14, text: text || "分析进行中" };
  return { percent: 0, text: "" };
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

const PANEL_COLLAPSE_LINE_THRESHOLD = 14;

function shouldCollapseMarkdown(markdown: string): boolean {
  const trimmed = markdown.trim();
  if (!trimmed) return false;
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  return lines > PANEL_COLLAPSE_LINE_THRESHOLD || trimmed.length > 700;
}

function CollapsibleMarkdown({
  panelKey,
  markdown,
  expanded,
  onToggle,
}: {
  panelKey: string;
  markdown: string;
  expanded: boolean;
  onToggle: (panelKey: string) => void;
}) {
  const collapsible = shouldCollapseMarkdown(markdown);
  return (
    <div className="collapsible-markdown-block">
      <div className={collapsible && !expanded ? "collapsible-markdown is-collapsed" : "collapsible-markdown"}>
        <MarkdownView markdown={markdown} />
      </div>
      {collapsible ? (
        <button
          type="button"
          className={`collapsible-markdown-toggle${expanded ? " is-expanded" : ""}`}
          onClick={() => onToggle(panelKey)}
          aria-expanded={expanded}
        >
          <span>{expanded ? "收起" : "展开完整内容"}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M9 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export function AnalysisDashboard({
  initialRecords,
  initialStorageMode,
  initialHasMore,
}: DashboardProps) {
  const [symbol, setSymbol] = useState("");
  const [analysisMode, setAnalysisMode] = useState<"quick" | "standard" | "deep">("quick");
  const [debateRounds, setDebateRounds] = useState("");
  const [period, setPeriod] = useState("6mo");
  const [interval, setInterval] = useState("1d");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState("");
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [streamCards, setStreamCards] = useState<StreamCardsState>(() => createEmptyStreamCardsState());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [storageMode, setStorageMode] = useState<"vercel_postgres" | "memory">(initialStorageMode);
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({});
  const [showTopProgressDone, setShowTopProgressDone] = useState(false);
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
  const isSidebarVisible = isDesktopLayout || isSidebarOpen;
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
  const recommendationCalibration = result?.recommendationCalibration ?? null;

  const sentimentGaugeScore = useMemo(() => {
    if (result) {
      const newsScore = toSentimentGaugeScore(result.stageBundle.news.avgSentiment);
      const socialScore = toSentimentGaugeScore(result.stageBundle.social.avgSentiment);
      if (newsScore === null && socialScore === null) return null;
      if (newsScore !== null && socialScore !== null) return Math.round(newsScore * 0.6 + socialScore * 0.4);
      return newsScore ?? socialScore;
    }

    const newsScore = toSentimentGaugeScore(streamCards.newsSnapshot?.avgSentiment);
    const socialScore = toSentimentGaugeScore(streamCards.socialSnapshot?.avgSentiment);
    if (newsScore === null && socialScore === null) return null;
    if (newsScore !== null && socialScore !== null) return Math.round(newsScore * 0.6 + socialScore * 0.4);
    return newsScore ?? socialScore;
  }, [result, streamCards.newsSnapshot, streamCards.socialSnapshot]);

  const sentimentGaugeText = useMemo(() => sentimentGaugeLabel(sentimentGaugeScore), [sentimentGaugeScore]);

  const sentimentSubScores = useMemo(() => {
    if (result) {
      return {
        news: toSentimentGaugeScore(result.stageBundle.news.avgSentiment),
        social: toSentimentGaugeScore(result.stageBundle.social.avgSentiment),
      };
    }
    return {
      news: toSentimentGaugeScore(streamCards.newsSnapshot?.avgSentiment),
      social: toSentimentGaugeScore(streamCards.socialSnapshot?.avgSentiment),
    };
  }, [result, streamCards.newsSnapshot, streamCards.socialSnapshot]);

  const latestNewsItems = useMemo<NewsItem[]>(() => {
    if (result) return (result.stageBundle.news.items ?? []).slice(0, 8);
    return (streamCards.newsSnapshot?.items ?? []).slice(0, 8);
  }, [result, streamCards.newsSnapshot]);

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

  const topProgress = useMemo(() => {
    const base = progressFromStatus(status, isAnalyzing, Boolean(result));
    const visible = isAnalyzing || showTopProgressDone;
    return { ...base, visible };
  }, [isAnalyzing, result, showTopProgressDone, status]);

  const togglePanelExpanded = useCallback((panelKey: string) => {
    setExpandedPanels((prev) => ({ ...prev, [panelKey]: !prev[panelKey] }));
  }, []);

  const quickJumpTargets = useMemo<QuickJumpTarget[]>(() => {
    const targets: QuickJumpTarget[] = [];
    if (!showAnalysisPanels) return targets;
    targets.push(
      { id: "section-market-snapshot", label: "市场快照" },
      { id: "section-sentiment-gauge", label: "情绪仪表盘" },
      { id: "section-news-feed", label: "News Feed" },
      { id: "section-analysts", label: "四位分析师" },
      { id: "section-debates", label: "多空辩论" },
      { id: "section-preliminary-plan", label: "交易计划" },
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
    const mediaQuery = window.matchMedia("(min-width: 1081px)");
    const syncLayout = () => {
      const desktop = mediaQuery.matches;
      setIsDesktopLayout(desktop);
      setIsSidebarOpen(desktop);
    };

    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);
    return () => {
      mediaQuery.removeEventListener("change", syncLayout);
    };
  }, []);

  useEffect(() => {
    if (!isSidebarOpen || isDesktopLayout) return;

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
  }, [isDesktopLayout, isSidebarOpen]);

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
    if (!isSidebarVisible || !recordsHasMore || isLoadingMoreRecords) return;
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
  }, [isSidebarVisible, records.length, recordsHasMore, isLoadingMoreRecords, loadMoreRecords]);

  useEffect(() => {
    const element = statusLogRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [statusLog]);

  useEffect(() => {
    if (!showTopProgressDone) return;
    const timer = window.setTimeout(() => setShowTopProgressDone(false), 2200);
    return () => window.clearTimeout(timer);
  }, [showTopProgressDone]);

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
    setShowTopProgressDone(false);
    setStatusLog([]);
    setStreamCards(createEmptyStreamCardsState());
    setResult(null);
    setExpandedPanels({});
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
      setShowTopProgressDone(true);

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
    setExpandedPanels({});
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
      {topProgress.visible ? (
        <div className="analysis-top-progress" role="status" aria-live="polite">
          <div className="analysis-top-progress-track" aria-hidden="true">
            <div className="analysis-top-progress-fill" style={{ width: `${topProgress.percent}%` }} />
          </div>
          <span className="analysis-top-progress-label">{topProgress.text}</span>
        </div>
      ) : null}
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />

      <div className="dashboard-layout">
        <aside
          ref={sidebarRef}
          className={`panel records-sidebar records-drawer${isSidebarVisible ? " is-open" : ""}`}
          id="records-drawer"
          aria-hidden={!isSidebarVisible}
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
          className={`records-drawer-toggle${isSidebarVisible ? " is-open" : ""}`}
          aria-expanded={isSidebarVisible}
          aria-controls="records-drawer"
          onClick={() => {
            if (isDesktopLayout) return;
            setIsSidebarOpen((prev) => !prev);
          }}
        >
          {isSidebarVisible ? "收起记录" : "展开记录"}
        </button>
        {!isDesktopLayout && isSidebarOpen ? (
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
              <div className="hero-actions">
                <a className="hero-link-button" href={REPO_URL} target="_blank" rel="noreferrer">
                  <svg
                    className="hero-link-icon"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      fill="currentColor"
                      d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.14.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
                    />
                  </svg>
                  <span>GitHub 仓库</span>
                </a>
                <a className="hero-link-button" href="/backtest">
                  <span>回测模块</span>
                </a>
                <a className="hero-link-button" href="/drift">
                  <span>漂移看板</span>
                </a>
                <a className="hero-link-button" href="/source-health">
                  <span>数据源健康</span>
                </a>
              </div>
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
              <section className="grid">
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

              </section>

              <section className="grid cols-2">
                <article className="panel anchor-target" id="section-sentiment-gauge">
                  <h2>情绪仪表盘</h2>
                  {sentimentGaugeScore !== null ? (
                    <div className="sentiment-panel">
                      <SentimentGauge score={sentimentGaugeScore} />
                      <p className="sentiment-panel-label">{sentimentGaugeText}</p>
                      <p className="sentiment-panel-meta">
                        新闻情绪 {sentimentSubScores.news ?? "--"} · 社媒情绪 {sentimentSubScores.social ?? "--"}
                      </p>
                    </div>
                  ) : (
                    <div className="empty-state">{isAnalyzing ? "情绪信号汇总中..." : "等待情绪数据"}</div>
                  )}
                </article>

                <article className="panel anchor-target" id="section-news-feed">
                  <h2>News Feed</h2>
                  {latestNewsItems.length ? (
                    <div className="news-feed-list">
                      {latestNewsItems.map((item, index) => (
                        <div className="news-feed-item" key={`${index}-${item.title}`}>
                          <div className="news-feed-head">
                            <strong>{item.title}</strong>
                            <span>{formatNewsTimestamp(item.publishedAt)}</span>
                          </div>
                          {item.summary ? <p>{shorten(item.summary, 180)}</p> : null}
                          <div className="news-feed-foot">
                            <em>{item.publisher ?? "未知来源"}</em>
                            {item.link ? (
                              <a href={item.link} target="_blank" rel="noreferrer">
                                查看
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">{isAnalyzing ? "资讯抓取中..." : "暂无资讯"}</div>
                  )}
                </article>
              </section>

              <section className="panel anchor-target" id="section-analysts">
                <h2>四位分析师</h2>
                <div className="card-grid">
                  <div className="card">
                    <SectionTitle icon="market" label="市场分析师" />
                    {marketReportMarkdown ? (
                      <CollapsibleMarkdown
                        panelKey="analyst-market"
                        markdown={marketReportMarkdown}
                        expanded={Boolean(expandedPanels["analyst-market"])}
                        onToggle={togglePanelExpanded}
                      />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "市场分析师正在生成中..." : "等待内容"}</div>
                    )}
                  </div>
                  <div className="card">
                    <SectionTitle icon="fundamentals" label="基本面分析师" />
                    {fundamentalsReportMarkdown ? (
                      <CollapsibleMarkdown
                        panelKey="analyst-fundamentals"
                        markdown={fundamentalsReportMarkdown}
                        expanded={Boolean(expandedPanels["analyst-fundamentals"])}
                        onToggle={togglePanelExpanded}
                      />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "基本面分析师正在生成中..." : "等待内容"}</div>
                    )}
                  </div>
                  <div className="card">
                    <SectionTitle icon="news" label="新闻分析师" />
                    {newsReportMarkdown ? (
                      <CollapsibleMarkdown
                        panelKey="analyst-news"
                        markdown={newsReportMarkdown}
                        expanded={Boolean(expandedPanels["analyst-news"])}
                        onToggle={togglePanelExpanded}
                      />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "新闻分析师正在生成中..." : "等待内容"}</div>
                    )}
                  </div>
                  <div className="card">
                    <SectionTitle icon="social" label="舆情分析师" />
                    {socialReportMarkdown ? (
                      <CollapsibleMarkdown
                        panelKey="analyst-social"
                        markdown={socialReportMarkdown}
                        expanded={Boolean(expandedPanels["analyst-social"])}
                        onToggle={togglePanelExpanded}
                      />
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
                            <SectionTitle icon="bull" label="多头" />
                            {turn.bullMarkdown ? (
                              <CollapsibleMarkdown
                                panelKey={`debate-${turn.roundId}-bull`}
                                markdown={turn.bullMarkdown}
                                expanded={Boolean(expandedPanels[`debate-${turn.roundId}-bull`])}
                                onToggle={togglePanelExpanded}
                              />
                            ) : (
                              <div className="empty-state">多头观点生成中...</div>
                            )}
                          </div>
                          <div className="card">
                            <SectionTitle icon="bear" label="空头" />
                            {turn.bearMarkdown ? (
                              <CollapsibleMarkdown
                                panelKey={`debate-${turn.roundId}-bear`}
                                markdown={turn.bearMarkdown}
                                expanded={Boolean(expandedPanels[`debate-${turn.roundId}-bear`])}
                                onToggle={togglePanelExpanded}
                              />
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

              <section className="panel anchor-target" id="section-preliminary-plan">
                <h2>研究主管初步交易计划</h2>
                {preliminaryPlanMarkdown ? (
                  <CollapsibleMarkdown
                    panelKey="preliminary-plan"
                    markdown={preliminaryPlanMarkdown}
                    expanded={Boolean(expandedPanels["preliminary-plan"])}
                    onToggle={togglePanelExpanded}
                  />
                ) : (
                  <div className="empty-state">
                    {isAnalyzing ? "研究主管正在汇总四位分析师观点..." : "等待交易计划"}
                  </div>
                )}
              </section>

              <section className="panel anchor-target" id="section-risk">
                <h2>风控内阁与最终裁定</h2>
                {recommendationCalibration ? (
                  <div className={`calibration-box level-${recommendationCalibration.confidenceLevel}`}>
                    <div className="calibration-head">
                      <strong>建议校准层</strong>
                      <span className="calibration-confidence">
                        置信度 {recommendationCalibration.confidence}/100（
                        {confidenceLevelText(recommendationCalibration.confidenceLevel)}）
                      </span>
                    </div>
                    <p className="calibration-main">
                      最终建议：{recommendationCalibration.finalRecommendation ?? "N/A"} · 内阁支持度：
                      {recommendationCalibration.supportVotes}/{recommendationCalibration.totalVotes}
                    </p>
                    <p className="calibration-summary">{recommendationCalibration.summary}</p>
                    {recommendationCalibration.conflicts.length ? (
                      <ul className="calibration-list">
                        {recommendationCalibration.conflicts.map((item, index) => (
                          <li key={`conflict-${index}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <div className="card-grid triple">
                  <div className="card">
                    <SectionTitle icon="risky" label="激进派" />
                    {riskyMarkdown ? (
                      <CollapsibleMarkdown
                        panelKey="risk-risky"
                        markdown={riskyMarkdown}
                        expanded={Boolean(expandedPanels["risk-risky"])}
                        onToggle={togglePanelExpanded}
                      />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "激进派评估中..." : "等待内容"}</div>
                    )}
                  </div>
                  <div className="card">
                    <SectionTitle icon="safe" label="保守派" />
                    {safeMarkdown ? (
                      <CollapsibleMarkdown
                        panelKey="risk-safe"
                        markdown={safeMarkdown}
                        expanded={Boolean(expandedPanels["risk-safe"])}
                        onToggle={togglePanelExpanded}
                      />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "保守派评估中..." : "等待内容"}</div>
                    )}
                  </div>
                  <div className="card">
                    <SectionTitle icon="neutral" label="中立派" />
                    {neutralMarkdown ? (
                      <CollapsibleMarkdown
                        panelKey="risk-neutral"
                        markdown={neutralMarkdown}
                        expanded={Boolean(expandedPanels["risk-neutral"])}
                        onToggle={togglePanelExpanded}
                      />
                    ) : (
                      <div className="empty-state">{isAnalyzing ? "中立派评估中..." : "等待内容"}</div>
                    )}
                  </div>
                </div>
                <div className="judge-box">
                  <h3>风控法官</h3>
                  {judgeMarkdown ? (
                    <CollapsibleMarkdown
                      panelKey="risk-judge"
                      markdown={judgeMarkdown}
                      expanded={Boolean(expandedPanels["risk-judge"])}
                      onToggle={togglePanelExpanded}
                    />
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
