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
  InvestmentRecommendation,
  RecommendationCalibration,
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

function clampScore(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function resolveTrendBias(trend: string | null | undefined): "bullish" | "bearish" | "neutral" {
  const normalized = (trend ?? "").toLowerCase();
  if (!normalized) return "neutral";
  if (/(down|bear|空|下跌|走弱|回落|弱势)/u.test(normalized)) return "bearish";
  if (/(up|bull|多|上涨|走强|上行|强势)/u.test(normalized)) return "bullish";
  return "neutral";
}

function resolveRecommendationBias(
  recommendation: InvestmentRecommendation | null,
): "bullish" | "bearish" | "neutral" {
  if (recommendation === "买入") return "bullish";
  if (recommendation === "减仓" || recommendation === "卖出") return "bearish";
  return "neutral";
}

function pickCabinetMajority(votes: InvestmentRecommendation[]): InvestmentRecommendation | null {
  if (!votes.length) return null;
  const order: InvestmentRecommendation[] = ["买入", "观望", "减仓", "卖出"];
  const counts = new Map<InvestmentRecommendation, number>();
  for (const vote of votes) {
    counts.set(vote, (counts.get(vote) ?? 0) + 1);
  }
  let best: InvestmentRecommendation | null = null;
  let bestCount = 0;
  let tied = false;
  for (const recommendation of order) {
    const count = counts.get(recommendation) ?? 0;
    if (count > bestCount) {
      best = recommendation;
      bestCount = count;
      tied = false;
      continue;
    }
    if (count > 0 && count === bestCount) {
      tied = true;
    }
  }
  if (tied || bestCount === 0) return null;
  return best;
}

function buildRecommendationCalibration(
  stageBundle: StageBundle,
  preliminaryPlan: string,
  riskReports: AnalysisResult["riskReports"],
): RecommendationCalibration {
  const riskyRecommendation = extractRecommendation(riskReports.risky);
  const safeRecommendation = extractRecommendation(riskReports.safe);
  const neutralRecommendation = extractRecommendation(riskReports.neutral);
  const judgeRecommendation = extractRecommendation(riskReports.judge);
  const managerRecommendation = extractRecommendation(preliminaryPlan);

  const cabinetVotes: InvestmentRecommendation[] = [
    riskyRecommendation,
    safeRecommendation,
    neutralRecommendation,
  ].filter((item): item is InvestmentRecommendation => Boolean(item));

  const cabinetMajority = pickCabinetMajority(cabinetVotes);
  const finalRecommendation = judgeRecommendation ?? cabinetMajority ?? managerRecommendation ?? null;
  const totalVotes = cabinetVotes.length;
  const supportVotes = finalRecommendation
    ? cabinetVotes.filter((vote) => vote === finalRecommendation).length
    : 0;

  const conflicts: string[] = [];
  if (judgeRecommendation && cabinetMajority && judgeRecommendation !== cabinetMajority) {
    conflicts.push(`法官建议（${judgeRecommendation}）与风控内阁多数意见（${cabinetMajority}）不一致。`);
  }
  if (cabinetVotes.length === 3) {
    const distinctVotes = new Set(cabinetVotes);
    if (distinctVotes.size === 3) {
      conflicts.push("风控内阁三方建议完全分歧，未形成一致结论。");
    }
  }
  if (cabinetVotes.length >= 2 && !cabinetMajority) {
    conflicts.push("风控内阁未形成多数结论，一致性偏弱。");
  }

  const trend = stageBundle.market.technicals.trend;
  const trendBias = resolveTrendBias(trend);
  const recommendationBias = resolveRecommendationBias(finalRecommendation);
  if (recommendationBias === "bullish" && trendBias === "bearish") {
    conflicts.push(`建议偏多（${finalRecommendation}），但技术趋势为${trend || "未知"}。`);
  }
  if (recommendationBias === "bearish" && trendBias === "bullish") {
    conflicts.push(`建议偏空（${finalRecommendation}），但技术趋势为${trend || "未知"}。`);
  }

  const sentimentInputs = [stageBundle.news.avgSentiment, stageBundle.social.avgSentiment].filter((value) =>
    Number.isFinite(value),
  ) as number[];
  const blendedSentiment =
    sentimentInputs.length > 0
      ? sentimentInputs.reduce((sum, value) => sum + value, 0) / sentimentInputs.length
      : null;
  if (blendedSentiment !== null) {
    if (recommendationBias === "bullish" && blendedSentiment <= -0.18) {
      conflicts.push("建议偏多，但新闻/舆情综合情绪偏负面。");
    }
    if (recommendationBias === "bearish" && blendedSentiment >= 0.18) {
      conflicts.push("建议偏空，但新闻/舆情综合情绪偏正面。");
    }
  }

  const socialErrorCount = Array.isArray(stageBundle.social.errors)
    ? stageBundle.social.errors.filter(Boolean).length
    : 0;
  const dataGaps: string[] = [];
  if (stageBundle.market.error) dataGaps.push("市场");
  if (stageBundle.fundamentals.error) dataGaps.push("基本面");
  if (stageBundle.news.error) dataGaps.push("新闻");
  if (socialErrorCount > 0) dataGaps.push(`舆情(${socialErrorCount}项)`);
  if (dataGaps.length) {
    conflicts.push(`部分数据源存在缺口：${dataGaps.join("、")}。`);
  }

  let confidence = finalRecommendation ? 46 : 22;
  if (judgeRecommendation) confidence += 16;
  if (managerRecommendation && managerRecommendation === finalRecommendation) confidence += 6;
  if (cabinetMajority && cabinetMajority === finalRecommendation) confidence += 10;
  if (totalVotes > 0 && finalRecommendation) {
    confidence += (supportVotes / totalVotes) * 14;
  }
  if (totalVotes === 0) confidence -= 10;
  if (stageBundle.market.error) confidence -= 10;
  else confidence += 4;
  if (stageBundle.fundamentals.error) confidence -= 8;
  else confidence += 4;
  if (stageBundle.news.error) confidence -= 6;
  else confidence += 3;
  if (socialErrorCount > 0) confidence -= Math.min(7, socialErrorCount * 2);
  else confidence += 3;
  confidence -= Math.min(24, conflicts.length * 6);
  confidence = clampScore(confidence, 5, 95);

  const confidenceLevel: RecommendationCalibration["confidenceLevel"] =
    confidence >= 72 ? "high" : confidence >= 50 ? "medium" : "low";
  const levelText =
    confidenceLevel === "high" ? "信号一致性高" : confidenceLevel === "medium" ? "信号一致性中等" : "信号分歧偏大";
  const summary = conflicts.length
    ? `${levelText}，检测到 ${conflicts.length} 项冲突信号。`
    : `${levelText}，暂未发现显著冲突信号。`;

  const evidence: string[] = [
    `风控投票：激进=${riskyRecommendation ?? "未给出"}，保守=${safeRecommendation ?? "未给出"}，中立=${neutralRecommendation ?? "未给出"}。`,
    `研究主管建议=${managerRecommendation ?? "未给出"}；法官建议=${judgeRecommendation ?? "未给出"}。`,
    `技术趋势=${trend || "未知"}。`,
    blendedSentiment === null
      ? "综合情绪=数据不足。"
      : `综合情绪=${blendedSentiment.toFixed(3)}（新闻+舆情均值）。`,
    dataGaps.length ? `数据完整性：存在缺口（${dataGaps.join("、")}）。` : "数据完整性：主要数据源可用。",
  ];

  return {
    finalRecommendation,
    confidence,
    confidenceLevel,
    supportVotes,
    totalVotes,
    conflicts,
    evidence,
    summary,
  };
}

function renderFinalMarkdown(input: AnalysisInput, result: Omit<AnalysisResult, "finalReport">): string {
  const generatedAt = new Date().toISOString();
  const debateText = result.debates
    .map(
      (d) =>
        `### 第 ${d.roundId} 轮\n\n#### 多头观点\n${d.bullMarkdown}\n\n#### 空头观点\n${d.bearMarkdown}`,
    )
    .join("\n\n");
  const calibration = result.recommendationCalibration;
  const calibrationMarkdown = calibration
    ? `
## 建议校准层
- 最终建议: \`${calibration.finalRecommendation ?? "N/A"}\`
- 置信度: \`${calibration.confidence}/100 (${calibration.confidenceLevel})\`
- 内阁支持度: \`${calibration.supportVotes}/${calibration.totalVotes}\`
- 校准摘要: ${calibration.summary}
- 冲突信号:
${calibration.conflicts.length ? calibration.conflicts.map((item) => `  - ${item}`).join("\n") : "  - 暂无"}
- 证据摘要:
${calibration.evidence.map((item) => `  - ${item}`).join("\n")}
`
    : "";

  return `# tradins 多智能体股票分析报告

- 股票: \`${input.symbol}\`
- 模式: \`${input.analysisMode}\`
- 辩论轮次: \`${input.debateRounds}\`
- 生成时间(UTC): \`${generatedAt}\`

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

${calibrationMarkdown}
`;
}

export function extractRecommendation(markdown: string): InvestmentRecommendation | null {
  const text = markdown.replace(/\r/g, "");
  const recommendationPattern = /(买入|观望|减仓|卖出)/u;
  const sectionPattern = /##\s*最终投资建议(?!（开头）|（末尾）)[^\n]*\n([\s\S]{0,240})/gu;
  const sectionMatches = [...text.matchAll(sectionPattern)];
  for (let i = sectionMatches.length - 1; i >= 0; i -= 1) {
    const body = sectionMatches[i]?.[1];
    if (!body) continue;
    const hit = body.match(recommendationPattern);
    if (hit?.[1]) return hit[1] as InvestmentRecommendation;
  }

  const advicePattern = /建议[:：]\s*`?(买入|观望|减仓|卖出)`?/gu;
  const adviceMatches = [...text.matchAll(advicePattern)];
  if (adviceMatches.length) {
    const last = adviceMatches.at(-1);
    if (last?.[1]) return last[1] as InvestmentRecommendation;
  }

  const keywordPattern = /(买入|观望|减仓|卖出)/gu;
  const keywordMatches = [...text.matchAll(keywordPattern)];
  if (keywordMatches.length) {
    const last = keywordMatches.at(-1);
    if (last?.[1]) return last[1] as InvestmentRecommendation;
  }

  return null;
}

export function resolveFinalRecommendation(result: AnalysisResult): InvestmentRecommendation | null {
  return result.recommendationCalibration?.finalRecommendation ?? extractRecommendation(result.riskReports.judge);
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
  const judge = rawJudge;
  await emitArtifact(onEvent, {
    artifactType: "risk",
    side: "judge",
    title: "风控法官最终裁定",
    markdown: judge,
  });

  const graphMermaid = getFlowGraphMermaid();
  const recommendationCalibration = buildRecommendationCalibration(stageBundle, preliminaryPlan, {
    risky,
    safe,
    neutral,
    judge,
  });
  const baseResult: Omit<AnalysisResult, "finalReport"> = {
    symbol: input.symbol,
    analystReports,
    debates,
    preliminaryPlan,
    riskReports: { risky, safe, neutral, judge },
    recommendationCalibration,
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
