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

const ANALYST_PROMPT_GUARDRAILS = `专业输出约束：
- 禁止空泛结论（如“趋势较混合”），每个结论必须绑定可核验的字段级证据（示例：\`macdHist=0.018 -> 动量走强\`）。
- 至少给出 1 个主场景 + 1 个反场景，并写清触发条件与失效条件（可用价格、幅度、量能、事件阈值）。
- 若关键字段缺失，必须明确“证据缺口”并下调结论置信度。
- 报告末尾追加一个 Markdown 表格，列建议：证据/当前值/阈值/方向/结论影响。`;

const DEBATE_PROMPT_GUARDRAILS = `辩论约束：
- 先复述对方最强论点（steelman）再反驳，避免各说各话。
- 至少引用 3 条跨维度证据（技术/基本面/消息/舆情）并给出阈值或条件句。
- 不允许只给观点，必须给“何时成立/何时失效”的行动门槛。`;

const DECISION_PROMPT_GUARDRAILS = `决策约束：
- 不得把“观望”当默认兜底；仅在关键证据冲突或缺失时可观望，并明确解除观望条件。
- 所有建议都要给执行触发条件、失效条件、仓位上限与止损纪律。
- 建议必须落在 买入/观望/减仓/卖出 四选一，并保留可解析格式。`;

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
    "你是市场分析师，专注技术面。输出中文 Markdown，结论必须可交易、可验证。",
    `请按以下章节输出报告并引用数字证据：
## 技术指标分析
## 价格趋势分析
## 支撑位和压力位
## 交易信号与置信度
## 风险提示

要求：
- 至少覆盖 MA、MACD、RSI、布林带、量能 5 类证据，不足时说明缺口。
- “交易信号与置信度”中必须包含：主场景、反场景、触发条件、失效条件、置信度（x/100）。
- 避免“偏震荡/待观察”等笼统措辞，必须转成阈值规则。
${ANALYST_PROMPT_GUARDRAILS}

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
    "你是基本面分析师。输出中文 Markdown，重点是估值、增长、财务质量与可执行结论。",
    `请按以下章节输出报告：
## 估值分析
## 增长与盈利质量
## 财务稳健性
## 基本面结论
## 风险提示

要求：
- 至少引用 6 个核心字段（估值、增长、盈利、现金流、杠杆、偿债）并写明“字段值 -> 结论”。
- 基本面结论需包含：主驱动因子、最脆弱假设、未来 1-2 个财报周期验证点。
- 若出现数据缺口，必须明确缺口影响与置信度下调幅度。
${ANALYST_PROMPT_GUARDRAILS}

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
    "你是新闻分析师，提炼可交易事件。输出中文 Markdown，避免只做摘要。",
    `请按以下章节输出：
## 关键事件提要
## 利好与利空分类
## 影响路径分析
## 消息面结论
## 风险提示

要求：
- 事件必须区分“已落地事实 / 市场预期 / 媒体叙事”，避免混为一谈。
- 影响路径需写清：事件 -> 财务变量或风险溢价 -> 股价传导。
- 给出事件有效期（短/中期）与失效信号。
${ANALYST_PROMPT_GUARDRAILS}

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
    "你是舆情分析师，评估散户热度与情绪结构。输出中文 Markdown，强调可交易含义。",
    `请按以下章节输出：
## 讨论热度
## 情绪倾向
## 关键话题
## 舆情结论
## 风险提示

要求：
- 区分“噪声热度”和“方向性情绪”，并给出各自对交易的使用方式。
- 给出情绪反转触发条件（如情绪极值+量价背离）与失效条件。
- 对异常集中话题给出“可验证信号”，避免只描述情绪。
${ANALYST_PROMPT_GUARDRAILS}

股票: ${symbol}
数据:
\`\`\`json
${jsonBlob(payload)}
\`\`\``,
    fallback,
  );
  return { agent: "Social Analyst", role: "舆情", markdown, payload };
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
    "你是多头研究员，负责提出可验证的多头论证，而不是口号式看多。",
    `第 ${round} 轮辩论。请按以下章节输出：
## 核心多头观点
## 证据链（逐条引用）
## 对空头最强论点的复述（steelman）
## 对空头观点的反驳
## 本轮结论（买入条件）

要求：
- 必须先复述空头最强论点，再逐条反驳。
- 本轮结论中写出“触发阈值、失效阈值、对应仓位动作”。
${DEBATE_PROMPT_GUARDRAILS}

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
    "你是空头研究员，负责提出可验证的风险链条，而不是情绪化看空。",
    `第 ${round} 轮辩论。请按以下章节输出：
## 核心空头观点
## 风险证据链（逐条引用）
## 对多头最强论点的复述（steelman）
## 对多头观点的反驳
## 本轮结论（回避/卖出条件）

要求：
- 必须先复述多头最强论点，再逐条拆解其脆弱假设。
- 本轮结论中写出“触发阈值、失效阈值、对应仓位动作”。
${DEBATE_PROMPT_GUARDRAILS}

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
- 建议: \`观望\`

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
    "你是研究主管，负责客观整合多空观点并给出可执行交易计划。",
    `请按以下章节输出初步交易计划：
## 综合判断
## 初步交易计划
## 关键触发条件
## 放弃交易条件
## 证据缺口

要求：
- “综合判断”必须包含一行：\`- 建议: \`买入/观望/减仓/卖出\`\`。
- 不能把观望作为默认结论；若给观望，必须写清“解除观望条件”。
- 必须写出“支持该建议的前 3 条证据”和“最关键反证”。
${DECISION_PROMPT_GUARDRAILS}

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
    "你是激进派风控，目标是在可控风险下提高收益，必须输出明确建议与约束。",
    `请按以下章节输出：
## 激进策略可行性
## 可放宽的约束
## 最坏情形下的容错方案
## 风控建议

要求：
- “风控建议”中必须包含一行：\`- 建议: \`买入/观望/减仓/卖出\`\`
- 建议必须四选一，不可留空。
- 必须给出：仓位上限、单笔风险上限、止损触发、失效条件。
${DECISION_PROMPT_GUARDRAILS}

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
    "你是保守派风控，优先保护本金，必须输出明确建议与防守动作。",
    `请按以下章节输出：
## 最坏情况风险
## 需要收紧的风控阈值
## 防守优先执行方案
## 风控建议

要求：
- “风控建议”中必须包含一行：\`- 建议: \`买入/观望/减仓/卖出\`\`
- 建议必须四选一，不可留空。
- 必须给出：仓位上限、单笔风险上限、止损触发、失效条件。
${DECISION_PROMPT_GUARDRAILS}

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
    "你是中立派风控，平衡收益与回撤，必须输出明确建议与动态调仓规则。",
    `请按以下章节输出：
## 平衡性评估
## 折中后的仓位与止损建议
## 动态调整机制
## 风控建议

要求：
- “风控建议”中必须包含一行：\`- 建议: \`买入/观望/减仓/卖出\`\`
- 建议必须四选一，不可留空。
- 必须给出：仓位上限、单笔风险上限、止损触发、失效条件。
${DECISION_PROMPT_GUARDRAILS}

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
    "你是风控法官，必须输出明确最终建议、风控预算与执行门槛。",
    `请综合三位风控意见并按以下章节输出：
## 最终裁定
## 风险预算与仓位上限
## 执行纪律
## 触发警报与应急动作
## 最终投资建议

要求：最终建议必须是 买入/观望/减仓/卖出 之一。
- 若结论为观望，必须同时写出“解除观望条件”（至少 2 条）。
- 必须给出不采纳其余建议的理由，避免中性折中。
- “最终投资建议”中必须包含：\`- 建议: \`买入/观望/减仓/卖出\`\`
${DECISION_PROMPT_GUARDRAILS}

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
