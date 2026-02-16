import { getLLMConfig } from "@/lib/config";
import { llmComplete } from "@/lib/llm";

import type { ProImpactEvent } from "@/lib/data/pro-events";
import type { ValveImpactEvent } from "@/lib/data/valve-updates";

import { z } from "zod";

const PROMPT_VERSION = "buff-llm-v1";
const DEFAULT_MAX_EVENTS = 18;

export type BuffLlmIntelStatus = "ok" | "skipped" | "error";
export type BuffLlmDirection = "up" | "down" | "neutral" | "mixed" | "unknown";
export type BuffLlmEventType =
  | "valve_patch"
  | "valve_economy"
  | "pro_preference"
  | "pro_retirement"
  | "pro_roster"
  | "social_hype"
  | "rumor"
  | "other";

interface CompactInputEvent {
  refId: string;
  provider: "valve" | "pro";
  publishedAt: string;
  publishedAtMs: number;
  title: string;
  summary: string;
  categories: string[];
  tags: string[];
  players: string[];
  deterministicDirection: "up" | "down" | "flat" | "insufficient";
  deterministicImpact: number;
  deterministicRelevance: number;
  deterministicReturnsH24: number | null;
}

export interface BuffLlmEventInsight {
  refId: string;
  provider: "valve" | "pro";
  publishedAt: string;
  topic: string;
  eventType: BuffLlmEventType;
  direction: BuffLlmDirection;
  confidence: number;
  relevance: number;
  hypeScore: number;
  reliability: number;
  horizonHours: number;
  duplicateOf: string | null;
  conflictsWith: string[];
  evidence: string[];
  reason: string;
}

export interface BuffLlmNarrative {
  summary: string;
  rationale: string[];
  risks: string[];
  advice: string[];
}

export interface BuffLlmAggregate {
  signal: number;
  hypeRisk: number;
  conflictRisk: number;
  reliability: number;
  relevance: number;
  coveragePct: number;
}

export interface BuffLlmIntelResult {
  status: BuffLlmIntelStatus;
  enabled: boolean;
  model: string | null;
  promptVersion: string;
  sourceCount: number;
  analyzedCount: number;
  aggregate: BuffLlmAggregate;
  narrative: BuffLlmNarrative | null;
  eventInsights: BuffLlmEventInsight[];
  warning: string | null;
}

export interface AnalyzeBuffLlmIntelInput {
  goodsId: number;
  goodsName: string | null;
  valveEvents: ValveImpactEvent[];
  proEvents: ProImpactEvent[];
  maxEvents?: number;
  enabled?: boolean;
}

const LlmDirectionSchema = z.enum(["up", "down", "neutral", "mixed", "unknown"]);
const LlmEventTypeSchema = z.enum([
  "valve_patch",
  "valve_economy",
  "pro_preference",
  "pro_retirement",
  "pro_roster",
  "social_hype",
  "rumor",
  "other",
]);

const LlmEventSchema = z.object({
  refId: z.string().min(1).max(256),
  topic: z.string().max(240).optional().default(""),
  eventType: z.string().max(64).optional().default("other"),
  direction: z.string().max(64).optional().default("unknown"),
  confidence: z.coerce.number().optional().default(0.5),
  relevance: z.coerce.number().optional().default(0.2),
  hypeScore: z.coerce.number().optional().default(0.25),
  reliability: z.coerce.number().optional().default(0.6),
  horizonHours: z.coerce.number().int().optional().default(72),
  duplicateOf: z.string().max(256).nullable().optional(),
  conflictsWith: z.array(z.string().max(256)).max(24).optional().default([]),
  evidence: z.array(z.string().max(180)).max(16).optional().default([]),
  reason: z.string().max(500).optional().default(""),
});

const LlmPayloadSchema = z.object({
  summary: z.string().max(1200).optional().default(""),
  rationale: z.array(z.string().max(400)).max(24).optional().default([]),
  risks: z.array(z.string().max(400)).max(24).optional().default([]),
  advice: z.array(z.string().max(400)).max(24).optional().default([]),
  events: z.array(z.unknown()).max(96).optional().default([]),
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function uniqueStrings(items: string[], maxCount: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxCount) break;
  }
  return result;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizedPublishedAtMs(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function dirSign(direction: BuffLlmDirection): number {
  if (direction === "up") return 1;
  if (direction === "down") return -1;
  if (direction === "mixed") return 0;
  return 0;
}

function cleanJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("LLM returned empty payload.");

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // ignore
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const candidate = fence[1].trim();
    JSON.parse(candidate);
    return candidate;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = trimmed.slice(start, end + 1);
    JSON.parse(candidate);
    return candidate;
  }

  throw new Error("LLM payload is not valid JSON.");
}

function baselineAggregate(sourceCount: number): BuffLlmAggregate {
  return {
    signal: 0,
    hypeRisk: 0,
    conflictRisk: 0,
    reliability: 0,
    relevance: 0,
    coveragePct: sourceCount ? 0 : 100,
  };
}

function compactEventSortKey(event: CompactInputEvent): number {
  return event.publishedAtMs;
}

function toCompactEvents(input: AnalyzeBuffLlmIntelInput, maxEvents: number): CompactInputEvent[] {
  const valveRows: CompactInputEvent[] = input.valveEvents.map((event) => ({
    refId: `valve:${event.id}`,
    provider: "valve",
    publishedAt: event.publishedAt,
    publishedAtMs: normalizedPublishedAtMs(event.publishedAt),
    title: event.title,
    summary: event.summary,
    categories: event.categories,
    tags: event.tags,
    players: [],
    deterministicDirection: event.direction,
    deterministicImpact: Math.abs(event.impactScore ?? 0),
    deterministicRelevance: clamp((event.impactScore ?? 0) / 3, 0, 1),
    deterministicReturnsH24: event.returnsPct.h24,
  }));

  const proRows: CompactInputEvent[] = input.proEvents.map((event) => ({
    refId: `pro:${event.id}`,
    provider: "pro",
    publishedAt: event.publishedAt,
    publishedAtMs: normalizedPublishedAtMs(event.publishedAt),
    title: event.title,
    summary: event.summary,
    categories: [event.eventType],
    tags: event.keywords,
    players: event.players.map((player) => player.name),
    deterministicDirection: event.direction,
    deterministicImpact: Math.abs(event.impactScore ?? 0),
    deterministicRelevance: clamp(event.relevanceScore ?? 0, 0, 1),
    deterministicReturnsH24: event.returnsPct.h24,
  }));

  return [...valveRows, ...proRows]
    .sort((left, right) => {
      if (right.deterministicImpact !== left.deterministicImpact) {
        return right.deterministicImpact - left.deterministicImpact;
      }
      return compactEventSortKey(right) - compactEventSortKey(left);
    })
    .slice(0, maxEvents)
    .sort((left, right) => compactEventSortKey(right) - compactEventSortKey(left));
}

function buildPrompt(events: CompactInputEvent[], goodsId: number, goodsName: string | null): string {
  const payload = {
    goods: {
      goodsId,
      goodsName: goodsName ?? null,
    },
    events: events.map((event) => ({
      refId: event.refId,
      provider: event.provider,
      publishedAt: event.publishedAt,
      title: event.title,
      summary: event.summary,
      categories: event.categories,
      tags: event.tags,
      players: event.players,
      deterministicDirection: event.deterministicDirection,
      deterministicImpact: event.deterministicImpact,
      deterministicRelevance: event.deterministicRelevance,
      deterministicReturnsH24: event.deterministicReturnsH24,
    })),
  };

  return [
    "请根据输入事件做 BUFF CS2 商品影响语义分析，必须输出严格 JSON。",
    "要求：",
    "1) 为每个 refId 输出事件类型、方向、相关性、炒作风险、可信度、去重关系、冲突关系。",
    "2) refId 必须来自输入，禁止编造。",
    "3) duplicateOf 只能引用输入中的 refId 或 null。",
    "4) conflictsWith 只能引用输入中的 refId，且不包含自身。",
    "5) evidence 用简短词组，不超过 4 个。",
    "6) summary/rationale/risks/advice 必须面向交易决策，中文输出。",
    "7) 若证据不足，direction 设 unknown，confidence/reliability 下降。",
    "输出 JSON 结构：",
    "{",
    '  "summary": "...",',
    '  "rationale": ["..."],',
    '  "risks": ["..."],',
    '  "advice": ["..."],',
    '  "events": [',
    "    {",
    '      "refId": "valve:...",',
    '      "topic": "...",',
    '      "eventType": "valve_patch|valve_economy|pro_preference|pro_retirement|pro_roster|social_hype|rumor|other",',
    '      "direction": "up|down|neutral|mixed|unknown",',
    '      "confidence": 0-1,',
    '      "relevance": 0-1,',
    '      "hypeScore": 0-1,',
    '      "reliability": 0-1,',
    '      "horizonHours": 6-720,',
    '      "duplicateOf": "refId|null",',
    '      "conflictsWith": ["refId"],',
    '      "evidence": ["..."],',
    '      "reason": "..."',
    "    }",
    "  ]",
    "}",
    "输入事件：",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n");
}

function severityWeight(eventType: BuffLlmEventType): number {
  if (eventType === "valve_economy") return 1;
  if (eventType === "pro_retirement") return 0.9;
  if (eventType === "pro_roster") return 0.78;
  if (eventType === "pro_preference") return 0.82;
  if (eventType === "social_hype") return 0.6;
  if (eventType === "valve_patch") return 0.68;
  if (eventType === "rumor") return 0.52;
  return 0.55;
}

function computeAggregate(
  insights: BuffLlmEventInsight[],
  sourceMap: Map<string, CompactInputEvent>,
  sourceCount: number,
): BuffLlmAggregate {
  if (!insights.length) {
    return baselineAggregate(sourceCount);
  }

  const nowMs = Date.now();
  let signalAcc = 0;
  let signalWeightAcc = 0;
  let hypeAcc = 0;
  let reliabilityAcc = 0;
  let relevanceAcc = 0;
  let supportAcc = 0;
  let conflictPoints = 0;

  const insightMap = new Map(insights.map((event) => [event.refId, event]));

  for (const insight of insights) {
    if (insight.duplicateOf && insightMap.has(insight.duplicateOf)) {
      continue;
    }

    const source = sourceMap.get(insight.refId);
    const ts = source?.publishedAtMs ?? 0;
    const ageHours = ts > 0 ? Math.max(0, (nowMs - ts) / (60 * 60 * 1000)) : 48;
    const decay = Math.exp(-ageHours / Math.max(12, insight.horizonHours));

    const direction = dirSign(insight.direction);
    const severity = severityWeight(insight.eventType);
    const trust = clamp(insight.confidence * 0.55 + insight.reliability * 0.45, 0, 1);
    const relevance = clamp(insight.relevance, 0, 1);

    const weight = clamp(severity * trust * relevance * decay, 0.02, 1);
    signalAcc += direction * weight;
    signalWeightAcc += weight;

    hypeAcc += insight.hypeScore * trust;
    reliabilityAcc += insight.reliability;
    relevanceAcc += insight.relevance;
    supportAcc += trust;

    const distinctConflicts = uniqueStrings(insight.conflictsWith, 8).filter((refId) => refId !== insight.refId).length;
    conflictPoints += distinctConflicts > 0 ? clamp(distinctConflicts / 4, 0, 1) : 0;
  }

  const analyzed = Math.max(1, insights.length);
  const signal = signalWeightAcc > 0 ? clamp(signalAcc / signalWeightAcc, -1, 1) : 0;
  const hypeRisk = clamp(hypeAcc / Math.max(0.0001, supportAcc), 0, 1);
  const reliability = clamp(reliabilityAcc / analyzed, 0, 1);
  const relevance = clamp(relevanceAcc / analyzed, 0, 1);
  const conflictRisk = clamp(conflictPoints / analyzed, 0, 1);
  const coveragePct = clamp((analyzed / Math.max(1, sourceCount)) * 100, 0, 100);

  return {
    signal: round(signal, 4),
    hypeRisk: round(hypeRisk, 4),
    conflictRisk: round(conflictRisk, 4),
    reliability: round(reliability, 4),
    relevance: round(relevance, 4),
    coveragePct: round(coveragePct, 2),
  };
}

function normalizeEventType(value: string): BuffLlmEventType {
  const normalized = value.trim().toLowerCase();
  const hit = LlmEventTypeSchema.safeParse(normalized);
  return hit.success ? hit.data : "other";
}

function normalizeDirection(value: string): BuffLlmDirection {
  const normalized = value.trim().toLowerCase();
  const hit = LlmDirectionSchema.safeParse(normalized);
  return hit.success ? hit.data : "unknown";
}

function sanitizeInsights(
  parsed: z.infer<typeof LlmPayloadSchema>,
  sourceMap: Map<string, CompactInputEvent>,
): BuffLlmEventInsight[] {
  const rows: BuffLlmEventInsight[] = [];

  for (const rawEvent of parsed.events) {
    const parsedEvent = LlmEventSchema.safeParse(rawEvent);
    if (!parsedEvent.success) continue;
    const event = parsedEvent.data;
    const source = sourceMap.get(event.refId);
    if (!source) continue;

    const conflictsWith = uniqueStrings(
      event.conflictsWith.filter((refId) => refId !== event.refId && sourceMap.has(refId)),
      8,
    );

    const duplicateOf =
      event.duplicateOf && event.duplicateOf !== event.refId && sourceMap.has(event.duplicateOf)
        ? event.duplicateOf
        : null;

    rows.push({
      refId: event.refId,
      provider: source.provider,
      publishedAt: source.publishedAt,
      topic: event.topic.trim() || source.title,
      eventType: normalizeEventType(event.eventType),
      direction: normalizeDirection(event.direction),
      confidence: round(clamp(event.confidence, 0, 1), 4),
      relevance: round(clamp(event.relevance, 0, 1), 4),
      hypeScore: round(clamp(event.hypeScore, 0, 1), 4),
      reliability: round(clamp(event.reliability, 0, 1), 4),
      horizonHours: Math.max(6, Math.min(720, Math.trunc(event.horizonHours))),
      duplicateOf,
      conflictsWith,
      evidence: uniqueStrings(event.evidence, 4),
      reason: event.reason.trim(),
    });
  }

  return rows.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

function toNarrative(parsed: z.infer<typeof LlmPayloadSchema>): BuffLlmNarrative {
  const summary = parsed.summary.trim() || "LLM 未产出稳定摘要，已按结构化事件继续计算。";
  return {
    summary,
    rationale: uniqueStrings(parsed.rationale, 4),
    risks: uniqueStrings(parsed.risks, 4),
    advice: uniqueStrings(parsed.advice, 4),
  };
}

function makeSkippedResult(sourceCount: number, model: string, warning: string): BuffLlmIntelResult {
  return {
    status: "skipped",
    enabled: false,
    model,
    promptVersion: PROMPT_VERSION,
    sourceCount,
    analyzedCount: 0,
    aggregate: baselineAggregate(sourceCount),
    narrative: null,
    eventInsights: [],
    warning,
  };
}

function makeErrorResult(sourceCount: number, model: string, warning: string): BuffLlmIntelResult {
  return {
    status: "error",
    enabled: true,
    model,
    promptVersion: PROMPT_VERSION,
    sourceCount,
    analyzedCount: 0,
    aggregate: baselineAggregate(sourceCount),
    narrative: null,
    eventInsights: [],
    warning,
  };
}

export function isBuffForecastLlmEnabled(requestEnabled?: boolean): boolean {
  if (typeof requestEnabled === "boolean") return requestEnabled;
  return parseBooleanEnv(process.env.BUFF_FORECAST_ENABLE_LLM, true);
}

export async function analyzeBuffLlmIntel(input: AnalyzeBuffLlmIntelInput): Promise<BuffLlmIntelResult> {
  const cfg = getLLMConfig();
  const model = cfg.model;
  const sourceCount = input.valveEvents.length + input.proEvents.length;

  const enabled = isBuffForecastLlmEnabled(input.enabled);
  if (!enabled) {
    return makeSkippedResult(sourceCount, model, "LLM 语义层已关闭（BUFF_FORECAST_ENABLE_LLM=false）。");
  }

  const maxEvents = Math.max(4, Math.min(32, Math.trunc(input.maxEvents ?? DEFAULT_MAX_EVENTS)));
  const compactEvents = toCompactEvents(input, maxEvents);

  if (!compactEvents.length) {
    return {
      status: "ok",
      enabled: true,
      model,
      promptVersion: PROMPT_VERSION,
      sourceCount: 0,
      analyzedCount: 0,
      aggregate: baselineAggregate(0),
      narrative: {
        summary: "缺少可分析事件，LLM 语义层未生成有效冲击信号。",
        rationale: [],
        risks: ["事件覆盖为空，方向判断主要依赖价格与盘口。"],
        advice: ["补充官方/职业事件后再刷新预测。"],
      },
      eventInsights: [],
      warning: "事件样本为空。",
    };
  }

  const sourceMap = new Map(compactEvents.map((event) => [event.refId, event]));

  try {
    const systemPrompt =
      "你是 CS2 饰品市场情报分析器。你只输出 JSON，不输出解释文本，不要使用 markdown 代码块。";
    const userPrompt = buildPrompt(compactEvents, input.goodsId, input.goodsName);
    const raw = await llmComplete(systemPrompt, userPrompt);
    const clean = cleanJsonText(raw);
    const payload = LlmPayloadSchema.parse(JSON.parse(clean) as unknown);

    const eventInsights = sanitizeInsights(payload, sourceMap);
    const narrative = toNarrative(payload);
    const aggregate = computeAggregate(eventInsights, sourceMap, compactEvents.length);

    return {
      status: "ok",
      enabled: true,
      model,
      promptVersion: PROMPT_VERSION,
      sourceCount: compactEvents.length,
      analyzedCount: eventInsights.length,
      aggregate,
      narrative,
      eventInsights,
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return makeErrorResult(sourceCount, model, `LLM 语义层降级：${message}`);
  }
}
