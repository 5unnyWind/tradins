import type { PolymarketMarketPoint, PolymarketSnapshot } from "@/lib/types";
import { fetchWithSourceHealth } from "@/lib/source-health";

const REQUEST_HEADERS = { "User-Agent": "tradins-next/0.1" } as const;
const POLYMARKET_ENDPOINT =
  "https://gamma-api.polymarket.com/markets?limit=350&closed=false&active=true&archived=false&order=volume24hr&ascending=false";
const ACTIVE_MARKET_CACHE_MS = 30_000;
const MAX_MARKETS_IN_SNAPSHOT = 12;
const DIRECTIONAL_SUMMARY_LIMIT = 80;

const TERM_ALIASES: Record<string, string[]> = {
  AAPL: ["apple"],
  MSFT: ["microsoft"],
  GOOGL: ["google", "alphabet"],
  GOOG: ["google", "alphabet"],
  AMZN: ["amazon"],
  META: ["meta", "facebook"],
  TSLA: ["tesla", "elon musk"],
  NVDA: ["nvidia"],
  AMD: ["amd", "advanced micro devices"],
  INTC: ["intel"],
  NFLX: ["netflix"],
  COIN: ["coinbase"],
  MSTR: ["microstrategy"],
  BTC: ["bitcoin", "btc", "crypto"],
  "BTC-USD": ["bitcoin", "btc", "crypto"],
  ETH: ["ethereum", "eth", "crypto"],
  "ETH-USD": ["ethereum", "eth", "crypto"],
  SOL: ["solana", "sol", "crypto"],
  "SOL-USD": ["solana", "sol", "crypto"],
  XRP: ["xrp", "ripple", "crypto"],
  "XRP-USD": ["xrp", "ripple", "crypto"],
  DOGE: ["dogecoin", "doge", "crypto"],
  "DOGE-USD": ["dogecoin", "doge", "crypto"],
  BNB: ["bnb", "binance coin", "crypto"],
  "BNB-USD": ["bnb", "binance coin", "crypto"],
  "GC=F": ["gold", "xau", "precious metals"],
  "SI=F": ["silver", "xag", "precious metals"],
};

type RawPolymarketMarket = Record<string, unknown>;

let cachedActiveMarkets: { at: number; markets: RawPolymarketMarket[] } | null = null;

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function round(value: number | null, digits = 4): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function clampProbability(value: number | null): number | null {
  if (value === null) return null;
  return Math.max(0, Math.min(1, value));
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown[];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [trimmed];
}

function normalizeTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolvePolymarketQueryTerms(symbol: string): string[] {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return [];
  const set = new Set<string>();

  const push = (raw: string) => {
    const term = normalizeTerm(raw);
    if (term.length >= 2) set.add(term);
  };

  push(normalizedSymbol);
  push(normalizedSymbol.replace(/[^A-Z0-9]/g, ""));

  const tokens = normalizedSymbol
    .split(/[.\-_/=:,\s]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  for (const token of tokens) push(token);

  if (normalizedSymbol.endsWith("-USD")) {
    push(normalizedSymbol.slice(0, -4));
  }

  for (const alias of TERM_ALIASES[normalizedSymbol] ?? []) {
    push(alias);
  }

  if (tokens.length) {
    const joinedKey = tokens.join("-");
    for (const alias of TERM_ALIASES[joinedKey] ?? []) {
      push(alias);
    }
  }

  return [...set];
}

function scoreByTerms(text: string, queryTerms: string[]): number {
  const normalizedText = normalizeTerm(text);
  if (!normalizedText) return 0;
  let score = 0;
  for (const term of queryTerms) {
    if (!term) continue;
    const boundaryPattern = new RegExp(`(?:^|\\s)${escapeRegExp(term)}(?:$|\\s)`, "i");
    if (boundaryPattern.test(normalizedText)) {
      score += 3;
      continue;
    }
    if (normalizedText.includes(term)) {
      score += 1;
    }
  }
  return score;
}

function classifyDirection(question: string): PolymarketMarketPoint["direction"] {
  const text = question.toLowerCase();
  const bullish =
    /(reach|above|over|at least|rise|rally|higher|upside|surpass|exceed|approve|win|more than|greater than|bullish)/.test(
      text,
    ) ||
    /(all[- ]time high|new high)/.test(text);
  const bearish =
    /(below|under|drop|fall|crash|recession|shutdown|default|bankrupt|less than|miss|decline|slump|downside|bearish)/.test(
      text,
    ) ||
    /(new low|delist|sell off|selloff)/.test(text);
  if (bullish && !bearish) return "bullish";
  if (bearish && !bullish) return "bearish";
  return "neutral";
}

function resolveYesNoPrices(row: RawPolymarketMarket): { yesPrice: number | null; noPrice: number | null } {
  const outcomes = parseStringArray(row.outcomes).map((item) => item.toLowerCase());
  const prices = parseStringArray(row.outcomePrices).map((item) => toNumberOrNull(item));
  const yesIdx = outcomes.findIndex((outcome) => outcome === "yes");
  const noIdx = outcomes.findIndex((outcome) => outcome === "no");

  let yesPrice = yesIdx >= 0 ? toNumberOrNull(prices[yesIdx]) : null;
  let noPrice = noIdx >= 0 ? toNumberOrNull(prices[noIdx]) : null;

  if (yesPrice === null && prices.length >= 1) {
    yesPrice = toNumberOrNull(prices[0]);
  }
  if (noPrice === null && prices.length >= 2) {
    noPrice = toNumberOrNull(prices[1]);
  }
  if (yesPrice === null && noPrice !== null) {
    yesPrice = 1 - noPrice;
  }
  if (noPrice === null && yesPrice !== null) {
    noPrice = 1 - yesPrice;
  }

  return {
    yesPrice: clampProbability(yesPrice),
    noPrice: clampProbability(noPrice),
  };
}

function resolveEventTitle(row: RawPolymarketMarket): string | null {
  const events = row.events;
  if (!Array.isArray(events) || !events.length) return null;
  const title = String((events[0] as Record<string, unknown>)?.title ?? "").trim();
  return title || null;
}

function resolveMarketUrl(row: RawPolymarketMarket): string | null {
  const slug = String(row.slug ?? "").trim();
  if (!slug) return null;
  return `https://polymarket.com/event/${encodeURIComponent(slug)}`;
}

function toMarketPoint(row: RawPolymarketMarket, queryTerms: string[]): PolymarketMarketPoint | null {
  const question = String(row.question ?? "").trim();
  if (!question) return null;
  const eventTitle = resolveEventTitle(row);
  const relevanceScore = scoreByTerms(`${question} ${eventTitle ?? ""}`, queryTerms);
  if (relevanceScore <= 0) return null;

  const direction = classifyDirection(question);
  const { yesPrice, noPrice } = resolveYesNoPrices(row);
  return {
    id: String(row.id ?? ""),
    question,
    eventTitle,
    endDate: String(row.endDate ?? "").trim() || null,
    yesPrice,
    noPrice,
    volume24h: toNumberOrNull(row.volume24hr),
    liquidity: toNumberOrNull(row.liquidity),
    oneDayPriceChange: toNumberOrNull(row.oneDayPriceChange),
    direction,
    relevanceScore,
    url: resolveMarketUrl(row),
  };
}

function compareMarket(left: PolymarketMarketPoint, right: PolymarketMarketPoint): number {
  if (right.relevanceScore !== left.relevanceScore) return right.relevanceScore - left.relevanceScore;
  const rightVol = right.volume24h ?? -1;
  const leftVol = left.volume24h ?? -1;
  if (rightVol !== leftVol) return rightVol - leftVol;
  return (right.yesPrice ?? 0) - (left.yesPrice ?? 0);
}

function calculateImpliedBullishProbability(markets: PolymarketMarketPoint[]): number | null {
  let weightedSum = 0;
  let weightSum = 0;
  for (const market of markets.slice(0, DIRECTIONAL_SUMMARY_LIMIT)) {
    if (market.direction === "neutral") continue;
    const yes = market.yesPrice;
    if (yes === null) continue;
    const bullishProbability =
      market.direction === "bullish" ? yes : market.noPrice !== null ? market.noPrice : 1 - yes;
    const volumeWeight = Math.log1p(Math.max(0, market.volume24h ?? 0)) + 1;
    const relevanceWeight = Math.max(1, market.relevanceScore);
    const weight = volumeWeight * relevanceWeight;
    weightedSum += bullishProbability * weight;
    weightSum += weight;
  }
  if (weightSum <= 0) return null;
  return clampProbability(weightedSum / weightSum);
}

function avg(values: Array<number | null>): number | null {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    sum += value;
    count += 1;
  }
  return count ? sum / count : null;
}

async function fetchActiveMarkets(): Promise<RawPolymarketMarket[]> {
  const now = Date.now();
  if (cachedActiveMarkets && now - cachedActiveMarkets.at <= ACTIVE_MARKET_CACHE_MS) {
    return cachedActiveMarkets.markets;
  }

  const response = await fetchWithSourceHealth("polymarket", POLYMARKET_ENDPOINT, {
    headers: REQUEST_HEADERS,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status}`);
  }
  const json = await response.json();
  if (!Array.isArray(json)) {
    throw new Error("Polymarket API returned invalid payload.");
  }
  const rows = json.filter((item): item is RawPolymarketMarket => Boolean(item && typeof item === "object"));
  cachedActiveMarkets = { at: now, markets: rows };
  return rows;
}

function emptySnapshot(symbol: string, queryTerms: string[], error?: string): PolymarketSnapshot {
  return {
    symbol,
    queryTerms,
    fetchedAt: new Date().toISOString(),
    scannedMarkets: 0,
    matchedMarkets: 0,
    bullishCount: 0,
    bearishCount: 0,
    neutralCount: 0,
    impliedBullishProbability: null,
    avgYesPrice: null,
    avgNoPrice: null,
    avgVolume24h: null,
    topMarkets: [],
    ...(error ? { error } : {}),
  };
}

export async function fetchPolymarketSnapshot(symbol: string, topN = MAX_MARKETS_IN_SNAPSHOT): Promise<PolymarketSnapshot> {
  const queryTerms = resolvePolymarketQueryTerms(symbol);
  if (!queryTerms.length) {
    return emptySnapshot(symbol, [], "Polymarket 查询词为空");
  }

  try {
    const rows = await fetchActiveMarkets();
    const matched = rows
      .map((row) => toMarketPoint(row, queryTerms))
      .filter((row): row is PolymarketMarketPoint => row !== null)
      .sort(compareMarket);

    const safeTopN = Math.max(1, Math.min(20, Math.trunc(topN) || MAX_MARKETS_IN_SNAPSHOT));
    const topMarkets = matched.slice(0, safeTopN).map((market) => ({
      ...market,
      yesPrice: round(market.yesPrice, 4),
      noPrice: round(market.noPrice, 4),
      volume24h: round(market.volume24h, 2),
      liquidity: round(market.liquidity, 2),
      oneDayPriceChange: round(market.oneDayPriceChange, 4),
    }));

    const bullishCount = matched.filter((market) => market.direction === "bullish").length;
    const bearishCount = matched.filter((market) => market.direction === "bearish").length;
    const neutralCount = matched.filter((market) => market.direction === "neutral").length;

    return {
      symbol,
      queryTerms,
      fetchedAt: new Date().toISOString(),
      scannedMarkets: rows.length,
      matchedMarkets: matched.length,
      bullishCount,
      bearishCount,
      neutralCount,
      impliedBullishProbability: round(calculateImpliedBullishProbability(matched), 4),
      avgYesPrice: round(avg(topMarkets.map((market) => market.yesPrice)), 4),
      avgNoPrice: round(avg(topMarkets.map((market) => market.noPrice)), 4),
      avgVolume24h: round(avg(topMarkets.map((market) => market.volume24h)), 2),
      topMarkets,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return emptySnapshot(symbol, queryTerms, message);
  }
}
