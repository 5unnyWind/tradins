export type AnalysisMode = "quick" | "standard" | "deep";

export interface AnalysisInput {
  symbol: string;
  analysisMode: AnalysisMode;
  debateRounds: number;
  period: string;
  interval: string;
}

export interface TechnicalSnapshot {
  price: number | null;
  changePct1d: number | null;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  rsi14: number | null;
  bbUpper: number | null;
  bbMid: number | null;
  bbLower: number | null;
  volume: number | null;
  volumeRatio20d: number | null;
  support: number | null;
  resistance: number | null;
  trend: string;
}

export interface MarketSnapshot {
  symbol: string;
  period: string;
  interval: string;
  points: number;
  snapshotAt?: string | null;
  technicals: TechnicalSnapshot;
  recentBars: Record<
    string,
    { Open: number; High: number; Low: number; Close: number; Volume: number }
  >;
  error?: string;
}

export interface FundamentalsSnapshot {
  symbol: string;
  valuation: Record<string, number | null>;
  growthProfitability: Record<string, number | null>;
  financialHealth: Record<string, number | null>;
  statements: Record<string, unknown>;
  error?: string;
}

export interface NewsItem {
  title: string;
  summary: string;
  publisher: string | null;
  publishedAt: string | null;
  link: string | null;
  sentiment: { score: number; label: "positive" | "negative" | "neutral" };
}

export interface NewsSnapshot {
  symbol: string;
  count: number;
  distribution: { positive: number; negative: number; neutral: number };
  avgSentiment: number;
  topics: string[];
  items: NewsItem[];
  error?: string;
}

export interface SocialItem {
  source: "reddit" | "stocktwits" | "eastmoney-guba";
  title: string;
  text: string;
  score: number;
  comments: number;
  createdAt: string | null;
  link: string | null;
  sentiment: { score: number; label: "positive" | "negative" | "neutral" };
}

export interface SocialSnapshot {
  symbol: string;
  count: number;
  engagement: number;
  distribution: { positive: number; negative: number; neutral: number };
  avgSentiment: number;
  topics: string[];
  items: SocialItem[];
  errors: string[];
}

export interface StageBundle {
  market: MarketSnapshot;
  fundamentals: FundamentalsSnapshot;
  news: NewsSnapshot;
  social: SocialSnapshot;
}

export interface AgentReport {
  agent: string;
  role: string;
  markdown: string;
  payload: Record<string, unknown>;
}

export interface DebateTurn {
  roundId: number;
  bullMarkdown: string;
  bearMarkdown: string;
}

export type InvestmentRecommendation = "买入" | "观望" | "减仓" | "卖出";

export interface RecommendationCalibration {
  finalRecommendation: InvestmentRecommendation | null;
  confidence: number;
  confidenceLevel: "low" | "medium" | "high";
  supportVotes: number;
  totalVotes: number;
  conflicts: string[];
  evidence: string[];
  summary: string;
}

export interface AnalysisResult {
  symbol: string;
  analystReports: {
    market: AgentReport;
    fundamentals: AgentReport;
    news: AgentReport;
    social: AgentReport;
  };
  debates: DebateTurn[];
  preliminaryPlan: string;
  riskReports: {
    risky: string;
    safe: string;
    neutral: string;
    judge: string;
  };
  recommendationCalibration?: RecommendationCalibration;
  stageBundle: StageBundle;
  graphMermaid: string;
  finalReport: string;
}

export interface AnalysisRecordMeta {
  id: number;
  symbol: string;
  analysisMode: AnalysisMode;
  debateRounds: number;
  recommendation: string | null;
  createdAt: string;
}

export type SchedulerRunStatus = "idle" | "success" | "failed";

export interface SchedulerTask {
  id: number;
  name: string;
  symbol: string;
  analysisMode: AnalysisMode;
  debateRounds: number;
  period: string;
  interval: string;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: SchedulerRunStatus;
  lastRunMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerTaskCreateInput {
  name: string;
  symbol: string;
  analysisMode: AnalysisMode;
  debateRounds: number;
  period: string;
  interval: string;
  intervalMinutes: number;
  enabled: boolean;
}

export interface SchedulerTaskUpdateInput {
  name?: string;
  symbol?: string;
  analysisMode?: AnalysisMode;
  debateRounds?: number;
  period?: string;
  interval?: string;
  intervalMinutes?: number;
  enabled?: boolean;
}

export interface BacktestSignal {
  id: number;
  symbol: string;
  recommendation: InvestmentRecommendation | null;
  createdAt: string;
}

export interface BacktestTrade {
  startDate: string;
  endDate: string;
  exposure: number;
  returnPct: number;
  days: number;
}

export interface BacktestEquityPoint {
  date: string;
  strategyEquity: number;
  benchmarkEquity: number;
  exposure: number;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  annualizedReturnPct: number | null;
  benchmarkReturnPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  annualizedVolatilityPct: number | null;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRatePct: number | null;
}

export interface BacktestReport {
  symbol: string;
  lookbackDays: number;
  rangeStart: string;
  rangeEnd: string;
  signalCount: number;
  signalsUsed: number;
  metrics: BacktestMetrics;
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
}

export interface ConclusionDriftPoint {
  id: number;
  symbol: string;
  recommendation: InvestmentRecommendation | null;
  confidence: number | null;
  confidenceLevel: RecommendationCalibration["confidenceLevel"] | null;
  createdAt: string;
}

export interface ConclusionDriftMetrics {
  sampleCount: number;
  changeCount: number;
  buyCount: number;
  holdCount: number;
  reduceCount: number;
  sellCount: number;
  averageConfidence: number | null;
  maxConfidence: number | null;
  minConfidence: number | null;
}

export interface ConclusionDriftReport {
  symbol: string;
  limit: number;
  metrics: ConclusionDriftMetrics;
  points: ConclusionDriftPoint[];
}

export type DataSourceKey = "yahoo" | "eastmoney" | "reddit";

export interface DataSourceHealthItem {
  source: DataSourceKey;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  hitRatePct: number | null;
  failureRatePct: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  lastStatus: "success" | "failed" | "idle";
  lastError: string | null;
  lastLatencyMs: number | null;
  lastAt: string | null;
}

export interface DataSourceHealthSnapshot {
  generatedAt: string;
  latencyWindowSize: number;
  sources: DataSourceHealthItem[];
}
