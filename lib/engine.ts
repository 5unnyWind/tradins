import {
  bearResearcher,
  bullResearcher,
  fundamentalsAnalyst,
  marketAnalyst,
  neutralAnalyst,
  newsAnalyst,
  researchManager,
  riskJudge,
  riskyAnalyst,
  safeAnalyst,
  socialAnalyst,
} from "@/lib/agents";
import { getFlowGraphMermaid } from "@/lib/config";
import { fetchFundamentalSnapshot } from "@/lib/data/fundamentals";
import { fetchMarketSnapshot } from "@/lib/data/market";
import { fetchNewsSnapshot } from "@/lib/data/news";
import { fetchSocialSnapshot } from "@/lib/data/social";
import type {
  AgentReport,
  AnalysisInput,
  AnalysisResult,
  DebateTurn,
  StageBundle,
} from "@/lib/types";

export interface AnalysisProgressEvent {
  type: "progress";
  phase: string;
  message: string;
  step?: number;
  totalSteps?: number;
}

export interface AnalysisArtifactEvent {
  type: "artifact";
  artifactType: "analyst" | "debate" | "plan" | "risk" | "snapshot";
  title: string;
  markdown?: string;
  payload?: unknown;
  snapshotType?: "market";
  key?: "market" | "fundamentals" | "news" | "social";
  roundId?: number;
  side?: "bull" | "bear" | "risky" | "safe" | "neutral" | "judge";
}

export type AnalysisStreamEvent = AnalysisProgressEvent | AnalysisArtifactEvent;

type StreamReporter = (event: AnalysisStreamEvent) => void | Promise<void>;

async function emitEvent(
  reporter: StreamReporter | undefined,
  event: AnalysisStreamEvent,
): Promise<void> {
  if (!reporter) return;
  await reporter(event);
}

async function emitProgress(
  reporter: StreamReporter | undefined,
  event: Omit<AnalysisProgressEvent, "type">,
): Promise<void> {
  await emitEvent(reporter, { type: "progress", ...event });
}

async function emitArtifact(
  reporter: StreamReporter | undefined,
  event: Omit<AnalysisArtifactEvent, "type">,
): Promise<void> {
  await emitEvent(reporter, { type: "artifact", ...event });
}

export function sanitizeForJson<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") {
    return (Number.isFinite(value) ? value : null) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJson(item)) as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeForJson(v);
    }
    return out as T;
  }
  return value;
}

async function collectStageBundle(
  input: AnalysisInput,
  onMarketReady?: (market: StageBundle["market"]) => void | Promise<void>,
): Promise<StageBundle> {
  const marketPromise = fetchMarketSnapshot(input.symbol, input.period, input.interval);
  const fundamentalsPromise = fetchFundamentalSnapshot(input.symbol);
  const newsPromise = fetchNewsSnapshot(input.symbol, 12);
  const socialPromise = fetchSocialSnapshot(input.symbol, 30);

  const market = await marketPromise;
  if (onMarketReady) {
    await onMarketReady(market);
  }
  const [fundamentals, news, social] = await Promise.all([
    fundamentalsPromise,
    newsPromise,
    socialPromise,
  ]);
  return { market, fundamentals, news, social };
}

function recommendationOrUnknown(markdown: string): string {
  return extractRecommendation(markdown) ?? "未明确";
}

function decorateJudgeRecommendation(markdown: string, recommendation: string): string {
  const body = markdown.trim();
  return `## 最终投资建议（开头）
- 建议: \`${recommendation}\`

${body}

## 最终投资建议（末尾）
- 建议: \`${recommendation}\``;
}

function renderFinalMarkdown(input: AnalysisInput, result: Omit<AnalysisResult, "finalReport">): string {
  const generatedAt = new Date().toISOString();
  const finalRecommendation = recommendationOrUnknown(result.riskReports.judge);
  const debateText = result.debates
    .map(
      (d) =>
        `### 第 ${d.roundId} 轮\n\n#### 多头观点\n${d.bullMarkdown}\n\n#### 空头观点\n${d.bearMarkdown}`,
    )
    .join("\n\n");

  return `# tradins 多智能体股票分析报告

- 股票: \`${input.symbol}\`
- 模式: \`${input.analysisMode}\`
- 辩论轮次: \`${input.debateRounds}\`
- 生成时间(UTC): \`${generatedAt}\`

## 最终投资建议（开头）
- 建议: \`${finalRecommendation}\`

## 数据流图
\`\`\`mermaid
${result.graphMermaid}
\`\`\`

## 第一阶段：四位分析师报告
### 市场分析师
${result.analystReports.market.markdown}

### 基本面分析师
${result.analystReports.fundamentals.markdown}

### 新闻分析师
${result.analystReports.news.markdown}

### 舆情分析师
${result.analystReports.social.markdown}

## 第二阶段：多空辩论
${debateText || "_无辩论记录_"}

## 第三阶段：研究主管初步交易计划
${result.preliminaryPlan}

## 第四阶段：风控内阁
### 激进派风控
${result.riskReports.risky}

### 保守派风控
${result.riskReports.safe}

### 中立派风控
${result.riskReports.neutral}

## 风控法官最终裁定
${result.riskReports.judge}

## 最终投资建议（末尾）
- 建议: \`${finalRecommendation}\`
`;
}

export function extractRecommendation(markdown: string): string | null {
  const text = markdown.replace(/\r/g, "");
  const recommendationPattern = /(买入|观望|减仓|卖出)/u;
  const sectionPattern = /##\s*最终投资建议(?!（开头）|（末尾）)[^\n]*\n([\s\S]{0,240})/gu;
  const sectionMatches = [...text.matchAll(sectionPattern)];
  for (let i = sectionMatches.length - 1; i >= 0; i -= 1) {
    const body = sectionMatches[i]?.[1];
    if (!body) continue;
    const hit = body.match(recommendationPattern);
    if (hit?.[1]) return hit[1];
  }

  const advicePattern = /建议[:：]\s*`?(买入|观望|减仓|卖出)`?/gu;
  const adviceMatches = [...text.matchAll(advicePattern)];
  if (adviceMatches.length) {
    const last = adviceMatches.at(-1);
    if (last?.[1]) return last[1];
  }

  const keywordPattern = /(买入|观望|减仓|卖出)/gu;
  const keywordMatches = [...text.matchAll(keywordPattern)];
  if (keywordMatches.length) {
    const last = keywordMatches.at(-1);
    if (last?.[1]) return last[1];
  }

  return null;
}

export async function runTradinsAnalysis(
  input: AnalysisInput,
  onEvent?: StreamReporter,
): Promise<AnalysisResult> {
  const totalSteps = 6 + input.debateRounds * 2;
  let step = 0;
  const nextProgress = async (phase: string, message: string) => {
    step += 1;
    await emitProgress(onEvent, { phase, message, step, totalSteps });
  };

  await nextProgress("collect", "采集市场/基本面/新闻/舆情数据中");
  const stageBundle = await collectStageBundle(input, async (market) => {
    await emitArtifact(onEvent, {
      artifactType: "snapshot",
      snapshotType: "market",
      title: "市场快照",
      payload: sanitizeForJson(market),
    });
  });

  await nextProgress("analysts", "四位分析师并行研判中");
  const runAnalyst = async (
    key: "market" | "fundamentals" | "news" | "social",
    title: string,
    runner: () => Promise<AgentReport>,
  ): Promise<AgentReport> => {
    const report = await runner();
    await emitArtifact(onEvent, {
      artifactType: "analyst",
      key,
      title,
      markdown: report.markdown,
    });
    return report;
  };
  const [marketReport, fundamentalsReport, newsReport, socialReport] = await Promise.all([
    runAnalyst("market", "市场分析师报告", () =>
      marketAnalyst(input.symbol, stageBundle.market as unknown as Record<string, unknown>),
    ),
    runAnalyst("fundamentals", "基本面分析师报告", () =>
      fundamentalsAnalyst(input.symbol, stageBundle.fundamentals as unknown as Record<string, unknown>),
    ),
    runAnalyst("news", "新闻分析师报告", () =>
      newsAnalyst(input.symbol, stageBundle.news as unknown as Record<string, unknown>),
    ),
    runAnalyst("social", "舆情分析师报告", () =>
      socialAnalyst(input.symbol, stageBundle.social as unknown as Record<string, unknown>),
    ),
  ]);
  const analystReports = {
    market: marketReport,
    fundamentals: fundamentalsReport,
    news: newsReport,
    social: socialReport,
  };

  const debates: DebateTurn[] = [];
  const history: Array<Record<string, string>> = [];
  for (let round = 1; round <= input.debateRounds; round += 1) {
    await nextProgress("debate-bull", `第 ${round} 轮辩论：多头陈述`);
    const bull = await bullResearcher(input.symbol, round, analystReports, history);
    await emitArtifact(onEvent, {
      artifactType: "debate",
      roundId: round,
      side: "bull",
      title: `第 ${round} 轮 · 多头观点`,
      markdown: bull,
    });

    await nextProgress("debate-bear", `第 ${round} 轮辩论：空头反驳`);
    const bear = await bearResearcher(input.symbol, round, analystReports, [...history, { round: String(round), bull }]);
    await emitArtifact(onEvent, {
      artifactType: "debate",
      roundId: round,
      side: "bear",
      title: `第 ${round} 轮 · 空头观点`,
      markdown: bear,
    });

    const turn: DebateTurn = { roundId: round, bullMarkdown: bull, bearMarkdown: bear };
    debates.push(turn);
    history.push({ round: String(round), bull, bear });
  }

  await nextProgress("manager", "研究主管生成初步交易计划");
  const preliminaryPlan = await researchManager(input.symbol, analystReports, history);
  await emitArtifact(onEvent, {
    artifactType: "plan",
    title: "研究主管初步交易计划",
    markdown: preliminaryPlan,
  });

  const context = {
    stageBundle,
    analystReports: Object.fromEntries(
      Object.entries(analystReports).map(([k, v]) => [k, v.markdown]),
    ),
    debates,
  };

  await nextProgress("risk-cabinet", "风控内阁会审中（激进/保守/中立）");
  const runRisk = async (
    side: "risky" | "safe" | "neutral",
    title: string,
    runner: () => Promise<string>,
  ): Promise<string> => {
    const markdown = await runner();
    await emitArtifact(onEvent, {
      artifactType: "risk",
      side,
      title,
      markdown,
    });
    return markdown;
  };
  const [risky, safe, neutral] = await Promise.all([
    runRisk("risky", "风控内阁 · 激进派", () =>
      riskyAnalyst(input.symbol, preliminaryPlan, context),
    ),
    runRisk("safe", "风控内阁 · 保守派", () =>
      safeAnalyst(input.symbol, preliminaryPlan, context),
    ),
    runRisk("neutral", "风控内阁 · 中立派", () =>
      neutralAnalyst(input.symbol, preliminaryPlan, context),
    ),
  ]);

  await nextProgress("risk-judge", "风控法官生成最终裁定");
  const rawJudge = await riskJudge(input.symbol, preliminaryPlan, risky, safe, neutral, context);
  const judge = decorateJudgeRecommendation(rawJudge, recommendationOrUnknown(rawJudge));
  await emitArtifact(onEvent, {
    artifactType: "risk",
    side: "judge",
    title: "风控法官最终裁定",
    markdown: judge,
  });

  const graphMermaid = getFlowGraphMermaid();
  const baseResult: Omit<AnalysisResult, "finalReport"> = {
    symbol: input.symbol,
    analystReports,
    debates,
    preliminaryPlan,
    riskReports: { risky, safe, neutral, judge },
    stageBundle,
    graphMermaid,
  };
  await nextProgress("report", "整理最终分析报告");
  const finalReport = renderFinalMarkdown(input, baseResult);
  return sanitizeForJson({
    ...baseResult,
    finalReport,
  });
}
