import type { AnalysisInput, AnalysisMode } from "@/lib/types";
import { normalizeTradableSymbol } from "@/lib/instruments";

export interface LLMRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

function parseNumberEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function getLLMConfig(): LLMRuntimeConfig {
  const maxRetries = clampInt(parseNumberEnv(process.env.TRADINS_LLM_MAX_RETRIES, 2), 0, 8);
  const retryBaseDelayMs = clampInt(parseNumberEnv(process.env.TRADINS_LLM_RETRY_BASE_MS, 400), 50, 10_000);
  const retryMaxDelayMs = clampInt(
    parseNumberEnv(process.env.TRADINS_LLM_RETRY_MAX_MS, 5_000),
    retryBaseDelayMs,
    60_000,
  );
  return {
    baseUrl: process.env.TRADINS_BASE_URL ?? "https://ai.268.pw/v1",
    apiKey:
      process.env.TRADINS_API_KEY ??
      "sk-lnsbj84p9fFj5uENNvd0XMtunVtcbeUK9CV4PSYQ43rXsimM",
    model: process.env.TRADINS_MODEL ?? "gpt-5.2",
    temperature: Number(process.env.TRADINS_TEMPERATURE ?? "0.2"),
    maxTokens: Number(process.env.TRADINS_MAX_TOKENS ?? "1800"),
    maxRetries,
    retryBaseDelayMs,
    retryMaxDelayMs,
  };
}

export function normalizeAnalysisInput(raw: Partial<AnalysisInput>): AnalysisInput {
  const symbol = normalizeTradableSymbol(raw.symbol ?? "AAPL");
  const analysisMode = ((raw.analysisMode ?? "standard") as AnalysisMode).toLowerCase() as AnalysisMode;
  const modeRounds: Record<AnalysisMode, number> = {
    quick: 1,
    standard: 2,
    deep: 4,
  };
  const debateRounds = Math.max(1, Math.min(10, raw.debateRounds ?? modeRounds[analysisMode] ?? 2));
  return {
    symbol,
    analysisMode,
    debateRounds,
    period: raw.period ?? "6mo",
    interval: raw.interval ?? "1d",
  };
}

export function getFlowGraphMermaid(): string {
  return [
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
}
