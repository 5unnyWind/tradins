import { llmComplete } from "@/lib/llm";
import type { AgentReport } from "@/lib/types";

function jsonBlob(payload: unknown, limit = 14000): string {
  const txt = JSON.stringify(payload, null, 2);
  if (txt.length <= limit) return txt;
  return `${txt.slice(0, limit)}\n...<truncated>`;
}

function fmtNum(value: unknown, digits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  return n.toFixed(digits);
}

function fmtPct(value: unknown, digits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  const v = Math.abs(n) <= 1 ? n * 100 : n;
  return `${v.toFixed(digits)}%`;
}

async function askWithFallback(
  systemPrompt: string,
  userPrompt: string,
  fallback: string,
): Promise<string> {
  try {
    return await llmComplete(systemPrompt, userPrompt);
  } catch {
    return fallback;
  }
}

export async function marketAnalyst(symbol: string, payload: Record<string, unknown>): Promise<AgentReport> {
  const t = (payload.technicals ?? {}) as Record<string, unknown>;
  const fallback = `## 技术指标分析
- MA20/MA50/MA200: \`${fmtNum(t.ma20)}\` / \`${fmtNum(t.ma50)}\` / \`${fmtNum(t.ma200)}\`
- MACD/Signal/Hist: \`${fmtNum(t.macd, 3)}\` / \`${fmtNum(t.macdSignal, 3)}\` / \`${fmtNum(t.macdHist, 3)}\`
- RSI14: \`${fmtNum(t.rsi14)}\`
- 布林带: \`${fmtNum(t.bbUpper)}\` / \`${fmtNum(t.bbMid)}\` / \`${fmtNum(t.bbLower)}\`
- 量比(20d): \`${fmtNum(t.volumeRatio20d)}\`

## 价格趋势分析
- 当前价格: \`${fmtNum(t.price)}\`，1日涨跌: \`${fmtPct(t.changePct1d)}\`
- 趋势标签: \`${String(t.trend ?? "unknown")}\`

## 支撑位和压力位
- 支撑位: \`${fmtNum(t.support)}\`
- 压力位: \`${fmtNum(t.resistance)}\`

## 交易信号与置信度
- 结论: \`条件触发后顺势\`
- 置信度: \`62/100\`

## 风险提示
- 需与基本面、消息面和风控信号联合验证。`;
  const markdown = await askWithFallback(
    "你是市场分析师，专注技术面。输出中文 Markdown。",
    `请按以下章节输出报告并引用数字证据：
## 技术指标分析
## 价格趋势分析
## 支撑位和压力位
## 交易信号与置信度
## 风险提示

股票: ${symbol}
数据:
\`\`\`json
${jsonBlob(payload)}
\`\`\``,
    fallback,
  );
  return { agent: "Market Analyst", role: "技术面", markdown, payload };
}

export async function fundamentalsAnalyst(symbol: string, payload: Record<string, unknown>): Promise<AgentReport> {
  const v = (payload.valuation ?? {}) as Record<string, unknown>;
  const g = (payload.growthProfitability ?? {}) as Record<string, unknown>;
  const h = (payload.financialHealth ?? {}) as Record<string, unknown>;
  const sourceError = typeof payload.error === "string" ? payload.error.trim() : "";
  const dataAvailabilityHint = sourceError
    ? `\n数据可用性提示：${sourceError}\n请在“风险提示”中用用户友好表述说明“基础面数据暂不完整，已启用备源，结论置信度下调”，不要直接复述接口报错原文。`
    : "";
  const fallback = `## 估值分析
- PE(TTM/Forward): \`${fmtNum(v.trailingPE)} / ${fmtNum(v.forwardPE)}\`
- PB: \`${fmtNum(v.priceToBook)}\`，EV/Revenue: \`${fmtNum(v.enterpriseToRevenue)}\`

## 增长与盈利质量
- 营收同比: \`${fmtPct(g.revenueGrowthYoy)}\`
- 净利润同比: \`${fmtPct(g.netIncomeGrowthYoy)}\`
- 毛利率/营业利润率/净利率: \`${fmtPct(g.grossMargin)} / ${fmtPct(g.operatingMargin)} / ${fmtPct(g.profitMargin)}\`

## 财务稳健性
- 债务/资产: \`${fmtPct(h.debtToAssets)}\`
- 流动比率/速动比率: \`${fmtNum(h.currentRatio)} / ${fmtNum(h.quickRatio)}\`
- 自由现金流: \`${fmtNum(h.freeCashflow, 0)}\`

## 基本面结论
- 倾向: \`中性\`
- 关注: 增长持续性、现金流质量、估值回归。

## 风险提示
- 估值与盈利兑现错配会放大波动。${sourceError ? "\n- 基础面数据存在缺口，当前结论置信度应下调并结合其他维度交叉验证。" : ""}`;
  const markdown = await askWithFallback(
    "你是基本面分析师。输出中文 Markdown，重点是估值、增长、财务质量。",
    `请按以下章节输出报告：
## 估值分析
## 增长与盈利质量
## 财务稳健性
## 基本面结论
## 风险提示

股票: ${symbol}
数据:
\`\`\`json
${jsonBlob(payload)}
\`\`\`${dataAvailabilityHint}`,
    fallback,
  );
  return { agent: "Fundamentals Analyst", role: "基本面", markdown, payload };
}

export async function newsAnalyst(symbol: string, payload: Record<string, unknown>): Promise<AgentReport> {
  const dist = (payload.distribution ?? {}) as Record<string, unknown>;
  const topics = ((payload.topics as string[] | undefined) ?? []).slice(0, 8).join(", ");
  const fallback = `## 关键事件提要
- 新闻数量: \`${String(payload.count ?? 0)}\`
- 主题关键词: \`${topics || "N/A"}\`
- 平均情绪: \`${fmtNum(payload.avgSentiment, 3)}\`

## 利好与利空分类
- 利好: \`${String(dist.positive ?? 0)}\`
- 利空: \`${String(dist.negative ?? 0)}\`
- 中性: \`${String(dist.neutral ?? 0)}\`

## 影响路径分析
- 利好通常通过盈利预期上修传导到估值扩张。
- 利空通常通过风险溢价上升传导到估值压缩。

## 消息面结论
- 倾向: \`中性偏多\`

## 风险提示
- 标题情绪与事件落地存在偏差。`;
  const markdown = await askWithFallback(
    "你是新闻分析师，提炼可交易事件。输出中文 Markdown。",
    `请按以下章节输出：
## 关键事件提要
## 利好与利空分类
## 影响路径分析
## 消息面结论
## 风险提示

股票: ${symbol}
数据:
\`\`\`json
${jsonBlob(payload)}
\`\`\``,
    fallback,
  );
  return { agent: "News Analyst", role: "消息面", markdown, payload };
}

export async function socialAnalyst(symbol: string, payload: Record<string, unknown>): Promise<AgentReport> {
  const dist = (payload.distribution ?? {}) as Record<string, unknown>;
  const topics = ((payload.topics as string[] | undefined) ?? []).slice(0, 8).join(", ");
  const fallback = `## 讨论热度
- 帖子数量: \`${String(payload.count ?? 0)}\`
- 互动总量: \`${String(payload.engagement ?? 0)}\`

## 情绪倾向
- 平均情绪: \`${fmtNum(payload.avgSentiment, 3)}\`
- 正/负/中: \`${String(dist.positive ?? 0)} / ${String(dist.negative ?? 0)} / ${String(dist.neutral ?? 0)}\`

## 关键话题
- ${topics || "N/A"}

## 舆情结论
- 倾向: \`中性\`

## 风险提示
- 社媒噪声高，应作为择时辅助而非独立决策。`;
  const markdown = await askWithFallback(
    "你是舆情分析师，评估散户热度与情绪结构。输出中文 Markdown。",
    `请按以下章节输出：
## 讨论热度
## 情绪倾向
## 关键话题
## 舆情结论
## 风险提示

股票: ${symbol}
数据:
\`\`\`json
${jsonBlob(payload)}
\`\`\``,
    fallback,
  );
  return { agent: "Social Analyst", role: "舆情", markdown, payload };
}

export async function polymarketAnalyst(symbol: string, payload: Record<string, unknown>): Promise<AgentReport> {
  const implied = fmtPct(payload.impliedBullishProbability, 2);
  const matched = String(payload.matchedMarkets ?? 0);
  const bullish = String(payload.bullishCount ?? 0);
  const bearish = String(payload.bearishCount ?? 0);
  const neutral = String(payload.neutralCount ?? 0);
  const avgVol24h = fmtNum(payload.avgVolume24h, 2);
  const sourceError = typeof payload.error === "string" ? payload.error.trim() : "";
  const fallback = `## 事件市场热度
- 匹配市场数: \`${matched}\`
- 24h 平均成交额: \`${avgVol24h}\`

## 概率分布
- 事件隐含偏多概率: \`${implied}\`
- 偏多/偏空/中性事件: \`${bullish} / ${bearish} / ${neutral}\`

## 关键合约观察
- 重点关注高成交、临近到期且概率快速变化的合约。

## 事件驱动结论
- 倾向: \`中性\`

## 风险提示
- 事件市场价格会受短期情绪和流动性冲击影响，需与基本面和技术面交叉验证。${sourceError ? `\n- Polymarket 数据拉取存在异常：${sourceError}` : ""}`;
  const markdown = await askWithFallback(
    "你是事件市场分析师，专注 Polymarket 合约的隐含概率信号。输出中文 Markdown。",
    `请按以下章节输出：
## 事件市场热度
## 概率分布
## 关键合约观察
## 事件驱动结论
## 风险提示

股票/标的: ${symbol}
数据:
\`\`\`json
${jsonBlob(payload)}
\`\`\``,
    fallback,
  );
  return { agent: "Polymarket Analyst", role: "事件概率", markdown, payload };
}

export async function bullResearcher(
  symbol: string,
  round: number,
  reports: Record<string, AgentReport>,
  history: Array<Record<string, string>>,
): Promise<string> {
  const fallback = `## 核心多头观点
- 趋势与盈利若同向，存在顺势买入窗口。

## 证据链（逐条引用）
- 价格结构若站上均线并维持动量，说明买盘有延续性。
- 基本面增长与现金流若稳定，可支撑估值中枢。

## 对空头观点的反驳
- 多数风险可通过仓位与止损纪律控制。

## 本轮结论（买入条件）
- 仅在关键位突破并获得量能确认后分批介入。`;
  return askWithFallback(
    "你是多头研究员，只寻找买入理由。",
    `第 ${round} 轮辩论。请按以下章节输出：
## 核心多头观点
## 证据链（逐条引用）
## 对空头观点的反驳
## 本轮结论（买入条件）

股票: ${symbol}
分析师报告:
\`\`\`json
${jsonBlob(Object.fromEntries(Object.entries(reports).map(([k, v]) => [k, v.markdown])))}
\`\`\`
历史:
\`\`\`json
${jsonBlob(history)}
\`\`\``,
    fallback,
  );
}

export async function bearResearcher(
  symbol: string,
  round: number,
  reports: Record<string, AgentReport>,
  history: Array<Record<string, string>>,
): Promise<string> {
  const fallback = `## 核心空头观点
- 当前条件下回撤风险尚未被充分计价。

## 风险证据链（逐条引用）
- 压力位附近与量能不足容易导致假突破。
- 估值溢价较高时，预期下修会放大波动。

## 对多头观点的反驳
- 多头逻辑依赖多条件同时满足，任何断裂都可能触发回撤。

## 本轮结论（回避/卖出条件）
- 支撑失守时优先防守，避免逆势硬扛。`;
  return askWithFallback(
    "你是空头研究员，只寻找卖出或回避理由。",
    `第 ${round} 轮辩论。请按以下章节输出：
## 核心空头观点
## 风险证据链（逐条引用）
## 对多头观点的反驳
## 本轮结论（回避/卖出条件）

股票: ${symbol}
分析师报告:
\`\`\`json
${jsonBlob(Object.fromEntries(Object.entries(reports).map(([k, v]) => [k, v.markdown])))}
\`\`\`
历史:
\`\`\`json
${jsonBlob(history)}
\`\`\``,
    fallback,
  );
}

export async function researchManager(
  symbol: string,
  reports: Record<string, AgentReport>,
  debates: Array<Record<string, string>>,
): Promise<string> {
  const fallback = `## 综合判断
- 当前证据多空并存，适合条件触发交易。

## 初步交易计划
- 方向: 触发后顺势，不触发观望。
- 入场: 突破确认或回踩企稳后分批。
- 止损: 关键结构位下方 2%-3% 或收盘失守执行。
- 止盈: 5%-8% 分批 + 跟踪止盈。
- 仓位: 初始 20%-30%，确认后上调至 50% 上限。

## 关键触发条件
- 量能改善、趋势结构有效、无重大新增利空。

## 放弃交易条件
- 假突破、支撑失守、系统性风险升温。

## 证据缺口
- 缺行业横向估值和资金流细分数据。`;
  return askWithFallback(
    "你是研究主管，负责客观整合多空观点。",
    `请按以下章节输出初步交易计划：
## 综合判断
## 初步交易计划
## 关键触发条件
## 放弃交易条件
## 证据缺口

股票: ${symbol}
分析师报告:
\`\`\`json
${jsonBlob(Object.fromEntries(Object.entries(reports).map(([k, v]) => [k, v.markdown])))}
\`\`\`
辩论:
\`\`\`json
${jsonBlob(debates)}
\`\`\``,
    fallback,
  );
}

export async function riskyAnalyst(
  symbol: string,
  preliminaryPlan: string,
  context: Record<string, unknown>,
): Promise<string> {
  const fallback = `## 激进策略可行性
- 可行，但前提是结构突破或有效回踩确认。

## 可放宽的约束
- 若量价共振，可适度提高单次入场仓位。

## 最坏情形下的容错方案
- 分层止损 + 时间止损，快速纠错。

## 风控建议
- 建议: \`买入\``;
  return askWithFallback(
    "你是激进派风控，目标是在可控风险下提高收益，必须输出明确建议。",
    `请按以下章节输出：
## 激进策略可行性
## 可放宽的约束
## 最坏情形下的容错方案
## 风控建议

要求：
- “风控建议”中必须包含一行：\`- 建议: \`买入/观望/减仓/卖出\`\`
- 建议必须四选一，不可留空。

股票: ${symbol}
初步计划:
${preliminaryPlan}
上下文:
\`\`\`json
${jsonBlob(context)}
\`\`\``,
    fallback,
  );
}

export async function safeAnalyst(
  symbol: string,
  preliminaryPlan: string,
  context: Record<string, unknown>,
): Promise<string> {
  const fallback = `## 最坏情况风险
- 假突破与情绪反转叠加会放大回撤。

## 需要收紧的风控阈值
- 降低初始仓位，提高止损执行刚性。

## 防守优先执行方案
- 小仓试错，确认后再加仓；触发风控立即降敞口。

## 风控建议
- 建议: \`减仓\``;
  return askWithFallback(
    "你是保守派风控，优先保护本金，必须输出明确建议。",
    `请按以下章节输出：
## 最坏情况风险
## 需要收紧的风控阈值
## 防守优先执行方案
## 风控建议

要求：
- “风控建议”中必须包含一行：\`- 建议: \`买入/观望/减仓/卖出\`\`
- 建议必须四选一，不可留空。

股票: ${symbol}
初步计划:
${preliminaryPlan}
上下文:
\`\`\`json
${jsonBlob(context)}
\`\`\``,
    fallback,
  );
}

export async function neutralAnalyst(
  symbol: string,
  preliminaryPlan: string,
  context: Record<string, unknown>,
): Promise<string> {
  const fallback = `## 平衡性评估
- 计划方向合理，但执行需分阶段确认。

## 折中后的仓位与止损建议
- 初始 20%-30%，确认后扩到 40%-50%；止损采用结构位+固定比例。

## 动态调整机制
- 每日复核趋势、事件与情绪偏离后再调整仓位。

## 风控建议
- 建议: \`观望\``;
  return askWithFallback(
    "你是中立派风控，平衡收益与回撤，必须输出明确建议。",
    `请按以下章节输出：
## 平衡性评估
## 折中后的仓位与止损建议
## 动态调整机制
## 风控建议

要求：
- “风控建议”中必须包含一行：\`- 建议: \`买入/观望/减仓/卖出\`\`
- 建议必须四选一，不可留空。

股票: ${symbol}
初步计划:
${preliminaryPlan}
上下文:
\`\`\`json
${jsonBlob(context)}
\`\`\``,
    fallback,
  );
}

export async function riskJudge(
  symbol: string,
  preliminaryPlan: string,
  riskyReport: string,
  safeReport: string,
  neutralReport: string,
  context: Record<string, unknown>,
): Promise<string> {
  const fallback = `## 最终裁定
- 裁定: \`观望\`

## 风险预算与仓位上限
- 总仓位上限: \`50%\`
- 单笔风险上限: \`净值1%\`

## 执行纪律
- 仅在触发条件满足时进场，止损触发必须执行。

## 触发警报与应急动作
- 支撑跌破或突发重大利空时，立即降仓并复核假设。

## 最终投资建议
- 建议: \`观望\``;
  return askWithFallback(
    "你是风控法官，必须输出明确最终建议与风控预算。",
    `请综合三位风控意见并按以下章节输出：
## 最终裁定
## 风险预算与仓位上限
## 执行纪律
## 触发警报与应急动作
## 最终投资建议

要求：最终建议必须是 买入/观望/减仓/卖出 之一。

股票: ${symbol}
初步计划:
${preliminaryPlan}
激进派:
${riskyReport}
保守派:
${safeReport}
中立派:
${neutralReport}
上下文:
\`\`\`json
${jsonBlob(context)}
\`\`\``,
    fallback,
  );
}
