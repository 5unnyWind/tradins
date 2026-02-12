import type { AnalysisInput, AnalysisMode } from "@/lib/types";

export interface LLMRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export function getLLMConfig(): LLMRuntimeConfig {
  return {
    baseUrl: process.env.TRADINS_BASE_URL ?? "https://ai.268.pw/v1",
    apiKey:
      process.env.TRADINS_API_KEY ??
      "sk-lnsbj84p9fFj5uENNvd0XMtunVtcbeUK9CV4PSYQ43rXsimM",
    model: process.env.TRADINS_MODEL ?? "gpt-5.2",
    temperature: Number(process.env.TRADINS_TEMPERATURE ?? "0.2"),
    maxTokens: Number(process.env.TRADINS_MAX_TOKENS ?? "1800"),
  };
}

export function normalizeAnalysisInput(raw: Partial<AnalysisInput>): AnalysisInput {
  const symbol = (raw.symbol ?? "AAPL").trim().toUpperCase();
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
