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
  source: "reddit" | "stocktwits";
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
