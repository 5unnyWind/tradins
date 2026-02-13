import { eastmoneyKlineParams, resolveAShareSymbol } from "@/lib/data/a-share";
import { toFiniteNumber } from "@/lib/data/common";
import { listBacktestSignals } from "@/lib/db";
import { normalizeTradableSymbol, resolveInstrumentContext } from "@/lib/instruments";
import type {
  BacktestEquityPoint,
  BacktestMetrics,
  BacktestReport,
  BacktestTrade,
  InvestmentRecommendation,
} from "@/lib/types";

const REQUEST_HEADERS = { "User-Agent": "tradins-next/0.1" } as const;
const EASTMONEY_HEADERS = {
  "User-Agent": "tradins-next/0.1",
  Referer: "https://quote.eastmoney.com/",
} as const;

type HistoricalPricePoint = {
  ts: number;
  date: string;
  close: number;
};

export interface BacktestInput {
  symbol: string;
  lookbackDays: number;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function parseLookbackDays(value: number): number {
  if (!Number.isFinite(value)) return 365;
  return clampInt(value, 30, 3650);
}

function resolveYahooRange(lookbackDays: number): string {
  if (lookbackDays <= 31) return "1mo";
  if (lookbackDays <= 93) return "3mo";
  if (lookbackDays <= 186) return "6mo";
  if (lookbackDays <= 366) return "1y";
  if (lookbackDays <= 730) return "2y";
  if (lookbackDays <= 1825) return "5y";
  if (lookbackDays <= 3650) return "10y";
  return "max";
}

function exposureFromRecommendation(recommendation: InvestmentRecommendation | null): number {
  if (recommendation === "买入") return 1;
  if (recommendation === "减仓") return 0.5;
  if (recommendation === "观望") return 0;
  if (recommendation === "卖出") return 0;
  return 0;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddevSample(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function annualizedReturn(totalMultiplier: number, periods: number): number | null {
  if (!Number.isFinite(totalMultiplier) || totalMultiplier <= 0 || periods <= 0) return null;
  const years = periods / 252;
  if (years <= 0) return null;
  return totalMultiplier ** (1 / years) - 1;
}

function toPct(value: number): number {
  return Number((value * 100).toFixed(4));
}

function normalizeSignalSymbol(symbol: string): string {
  return normalizeTradableSymbol(symbol.trim());
}

async function fetchAshareHistoricalPrices(symbol: string, lookbackDays: number): Promise<HistoricalPricePoint[] | null> {
  const ashare = resolveAShareSymbol(symbol);
  if (!ashare) return null;

  const { klt, beg, end, lmt } = eastmoneyKlineParams(`${lookbackDays}d`, "1d");
  const endpoint =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?` +
    `secid=${encodeURIComponent(ashare.secid)}` +
    `&klt=${encodeURIComponent(klt)}` +
    `&fqt=1&beg=${encodeURIComponent(beg)}&end=${encodeURIComponent(end)}` +
    `&lmt=${lmt}` +
    `&ut=fa5fd1943c7b386f172d6893dbfba10b` +
    `&fields1=f1,f2,f3,f4,f5,f6` +
    `&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;

  const response = await fetch(endpoint, {
    headers: EASTMONEY_HEADERS,
    cache: "no-store",
  });
  if (!response.ok) return null;

  const json = await response.json();
  const rows = (json as { data?: { klines?: unknown[] } })?.data?.klines;
  if (!Array.isArray(rows) || !rows.length) return null;

  const points: HistoricalPricePoint[] = [];
  for (const row of rows) {
    const fields = String(row ?? "").split(",");
    if (fields.length < 3) continue;
    const date = fields[0]?.trim();
    const close = toFiniteNumber(fields[2]);
    if (!date || close === null || close <= 0) continue;

    const ms = Date.parse(`${date}T15:00:00+08:00`);
    if (!Number.isFinite(ms)) continue;
    points.push({
      ts: Math.floor(ms / 1000),
      date: new Date(ms).toISOString().slice(0, 10),
      close,
    });
  }

  points.sort((a, b) => a.ts - b.ts);
  return points;
}

async function fetchYahooHistoricalPrices(symbol: string, lookbackDays: number): Promise<HistoricalPricePoint[]> {
  const instrument = resolveInstrumentContext(symbol);
  const range = resolveYahooRange(lookbackDays);
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    instrument.marketSymbol,
  )}?range=${encodeURIComponent(range)}&interval=1d&includePrePost=false&events=div%2Csplits`;

  const response = await fetch(endpoint, {
    headers: REQUEST_HEADERS,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`历史行情请求失败: ${response.status}`);
  }

  const data = await response.json();
  const row = data?.chart?.result?.[0];
  const ts: number[] = Array.isArray(row?.timestamp) ? row.timestamp : [];
  const quote = row?.indicators?.quote?.[0] ?? {};
  const adjClose: number[] | undefined = row?.indicators?.adjclose?.[0]?.adjclose;
  const closeRaw = Array.isArray(quote?.close) ? quote.close : [];
  const close = Array.isArray(adjClose) && adjClose.length === closeRaw.length ? adjClose : closeRaw;

  const points: HistoricalPricePoint[] = [];
  for (let i = 0; i < ts.length; i += 1) {
    const time = Number(ts[i]);
    const closeValue = toFiniteNumber(close[i]);
    if (!Number.isFinite(time) || closeValue === null || closeValue <= 0) continue;
    const isoDate = new Date(time * 1000).toISOString().slice(0, 10);
    points.push({ ts: time, date: isoDate, close: closeValue });
  }

  points.sort((a, b) => a.ts - b.ts);
  return points;
}

async function fetchHistoricalPrices(symbol: string, lookbackDays: number): Promise<HistoricalPricePoint[]> {
  const fromTs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const ashare = await fetchAshareHistoricalPrices(symbol, lookbackDays);
  if (ashare && ashare.length) {
    return ashare.filter((point) => point.ts * 1000 >= fromTs);
  }

  const yahoo = await fetchYahooHistoricalPrices(symbol, lookbackDays);
  return yahoo.filter((point) => point.ts * 1000 >= fromTs);
}

function buildBacktestMetrics(args: {
  strategyReturns: number[];
  strategyMultiplier: number;
  benchmarkMultiplier: number;
  maxDrawdown: number;
  trades: BacktestTrade[];
}): BacktestMetrics {
  const { strategyReturns, strategyMultiplier, benchmarkMultiplier, maxDrawdown, trades } = args;
  const totalReturn = strategyMultiplier - 1;
  const benchmarkReturn = benchmarkMultiplier - 1;
  const annualized = annualizedReturn(strategyMultiplier, strategyReturns.length);

  const volatilityRaw = stddevSample(strategyReturns);
  const meanReturn = mean(strategyReturns);
  const sharpe = volatilityRaw && volatilityRaw > 0
    ? (meanReturn / volatilityRaw) * Math.sqrt(252)
    : null;

  const wins = trades.filter((trade) => trade.returnPct > 0).length;
  const losses = trades.filter((trade) => trade.returnPct <= 0).length;
  const winRate = trades.length ? wins / trades.length : null;

  return {
    totalReturnPct: toPct(totalReturn),
    annualizedReturnPct: annualized === null ? null : toPct(annualized),
    benchmarkReturnPct: toPct(benchmarkReturn),
    maxDrawdownPct: toPct(maxDrawdown),
    sharpeRatio: sharpe === null ? null : Number(sharpe.toFixed(4)),
    annualizedVolatilityPct: volatilityRaw === null ? null : toPct(volatilityRaw * Math.sqrt(252)),
    tradeCount: trades.length,
    winCount: wins,
    lossCount: losses,
    winRatePct: winRate === null ? null : toPct(winRate),
  };
}

export async function runBacktest(input: BacktestInput): Promise<BacktestReport> {
  const lookbackDays = parseLookbackDays(input.lookbackDays);
  const symbol = normalizeSignalSymbol(input.symbol);
  const rangeStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const [signals, prices] = await Promise.all([
    listBacktestSignals(symbol, rangeStart, 3000),
    fetchHistoricalPrices(symbol, lookbackDays),
  ]);

  if (signals.length === 0) {
    throw new Error("回测区间内无分析建议记录，请先产生一些分析记录后再回测。");
  }

  if (prices.length < 2) {
    throw new Error("历史价格数据不足，无法执行回测。");
  }

  const normalizedSignals = signals
    .map((signal) => ({
      ...signal,
      ts: new Date(signal.createdAt).getTime(),
    }))
    .filter((signal) => Number.isFinite(signal.ts))
    .sort((left, right) => left.ts - right.ts || left.id - right.id);

  if (!normalizedSignals.length) {
    throw new Error("建议记录时间戳异常，无法执行回测。");
  }

  const equityCurve: BacktestEquityPoint[] = [];
  const strategyReturns: number[] = [];
  const trades: BacktestTrade[] = [];

  let strategyMultiplier = 1;
  let benchmarkMultiplier = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let signalCursor = 0;
  let currentExposure = 0;
  let signalsUsed = 0;

  let openTrade: {
    startDate: string;
    exposure: number;
    multiplier: number;
    days: number;
  } | null = null;

  const closeTrade = (endDate: string) => {
    if (!openTrade) return;
    const tradeReturn = openTrade.multiplier - 1;
    trades.push({
      startDate: openTrade.startDate,
      endDate,
      exposure: openTrade.exposure,
      returnPct: toPct(tradeReturn),
      days: openTrade.days,
    });
    openTrade = null;
  };

  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1];
    const curr = prices[i];
    const prevMs = prev.ts * 1000;

    while (signalCursor < normalizedSignals.length && normalizedSignals[signalCursor].ts <= prevMs) {
      currentExposure = exposureFromRecommendation(normalizedSignals[signalCursor].recommendation);
      signalsUsed += 1;
      signalCursor += 1;
    }

    const assetReturn = curr.close / prev.close - 1;
    const strategyReturn = currentExposure * assetReturn;

    strategyMultiplier *= 1 + strategyReturn;
    benchmarkMultiplier *= 1 + assetReturn;

    strategyReturns.push(strategyReturn);

    if (currentExposure > 0) {
      if (!openTrade || openTrade.exposure !== currentExposure) {
        closeTrade(prev.date);
        openTrade = {
          startDate: prev.date,
          exposure: currentExposure,
          multiplier: 1 + strategyReturn,
          days: 1,
        };
      } else {
        openTrade.multiplier *= 1 + strategyReturn;
        openTrade.days += 1;
      }
    } else {
      closeTrade(prev.date);
    }

    if (strategyMultiplier > peak) peak = strategyMultiplier;
    const drawdown = peak > 0 ? (peak - strategyMultiplier) / peak : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    equityCurve.push({
      date: curr.date,
      strategyEquity: Number(strategyMultiplier.toFixed(6)),
      benchmarkEquity: Number(benchmarkMultiplier.toFixed(6)),
      exposure: currentExposure,
    });
  }

  closeTrade(prices[prices.length - 1]?.date ?? prices[0].date);

  const metrics = buildBacktestMetrics({
    strategyReturns,
    strategyMultiplier,
    benchmarkMultiplier,
    maxDrawdown,
    trades,
  });

  return {
    symbol,
    lookbackDays,
    rangeStart: prices[0]?.date ?? new Date(rangeStart).toISOString().slice(0, 10),
    rangeEnd: prices[prices.length - 1]?.date ?? new Date().toISOString().slice(0, 10),
    signalCount: signals.length,
    signalsUsed,
    metrics,
    equityCurve,
    trades,
  };
}

export function normalizeBacktestSymbol(raw: string): string {
  return normalizeSignalSymbol(raw);
}
