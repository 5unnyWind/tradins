import { toFiniteNumber } from "@/lib/data/common";
import type { FundamentalsSnapshot } from "@/lib/types";

const REQUEST_HEADERS = { "User-Agent": "tradins-next/0.1" } as const;

const TIMESERIES_TYPES = [
  "annualTotalRevenue",
  "quarterlyTotalRevenue",
  "annualNetIncome",
  "quarterlyNetIncome",
  "annualNetIncomeCommonStockholders",
  "quarterlyNetIncomeCommonStockholders",
  "annualGrossProfit",
  "quarterlyGrossProfit",
  "annualOperatingIncome",
  "quarterlyOperatingIncome",
  "annualEBITDA",
  "quarterlyEBITDA",
  "annualFreeCashFlow",
  "quarterlyFreeCashFlow",
  "annualTotalAssets",
  "annualTotalDebt",
  "annualCurrentAssets",
  "annualCurrentLiabilities",
  "annualCurrentDebtAndCapitalLeaseObligation",
  "annualLongTermDebtAndCapitalLeaseObligation",
  "annualCashAndCashEquivalents",
  "quarterlyCashAndCashEquivalents",
  "annualStockholdersEquity",
  "annualCommonStockEquity",
  "annualTotalEquityGrossMinorityInterest",
  "quarterlyStockholdersEquity",
  "quarterlyCommonStockEquity",
  "quarterlyTotalEquityGrossMinorityInterest",
  "annualOrdinarySharesNumber",
  "quarterlyOrdinarySharesNumber",
  "annualDilutedAverageShares",
  "quarterlyDilutedAverageShares",
  "annualBasicAverageShares",
  "quarterlyBasicAverageShares",
  "trailingDilutedEPS",
  "trailingBasicEPS",
  "annualDilutedEPS",
  "annualBasicEPS",
  "forwardEps",
  "annualInventory",
  "quarterlyInventory",
] as const;

type TimeseriesPoint = { asOfDate: string; value: number };

type JsonFetchResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

function rawNum(v: unknown): number | null {
  if (v && typeof v === "object" && "raw" in (v as Record<string, unknown>)) {
    return toFiniteNumber((v as { raw?: unknown }).raw);
  }
  return toFiniteNumber(v);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function firstArrayItem(value: unknown): unknown {
  if (!Array.isArray(value) || !value.length) return undefined;
  return value[0];
}

function yoy(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function readIncome(history: unknown, field: string): [number | null, number | null] {
  const list = (history as { incomeStatementHistory?: { incomeStatementHistory?: unknown[] } })
    ?.incomeStatementHistory?.incomeStatementHistory;
  if (!Array.isArray(list) || !list.length) return [null, null];
  const cur = rawNum((list[0] as Record<string, unknown>)?.[field]);
  const prev = rawNum((list[1] as Record<string, unknown>)?.[field]);
  return [cur, prev];
}

function readBalance(history: unknown, field: string): number | null {
  const list = (history as { balanceSheetStatements?: unknown[] })?.balanceSheetStatements;
  if (!Array.isArray(list) || !list.length) return null;
  return rawNum((list[0] as Record<string, unknown>)?.[field]);
}

function safeDiv(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function sumKnown(...values: Array<number | null>): number | null {
  let sum = 0;
  let seen = false;
  for (const value of values) {
    if (value === null) continue;
    sum += value;
    seen = true;
  }
  return seen ? sum : null;
}

function firstNonNull(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (value !== null) return value;
  }
  return null;
}

function numericBucketHasValue(bucket: Record<string, number | null>): boolean {
  return Object.values(bucket).some((value) => value !== null);
}

function hasAnySignal(snapshot: FundamentalsSnapshot): boolean {
  return (
    numericBucketHasValue(snapshot.valuation) ||
    numericBucketHasValue(snapshot.growthProfitability) ||
    numericBucketHasValue(snapshot.financialHealth)
  );
}

function parseYahooError(data: unknown): string | null {
  const financeError = asRecord(asRecord(data).finance).error;
  const quoteSummaryError = asRecord(asRecord(data).quoteSummary).error;
  const candidate =
    asString(asRecord(financeError).description) ??
    asString(asRecord(financeError).code) ??
    asString(asRecord(quoteSummaryError).description) ??
    asString(asRecord(quoteSummaryError).code);
  return candidate;
}

function emptySnapshot(symbol: string, error?: string): FundamentalsSnapshot {
  return {
    symbol,
    valuation: {
      marketCap: null,
      trailingPE: null,
      forwardPE: null,
      priceToBook: null,
      enterpriseToRevenue: null,
      enterpriseToEbitda: null,
    },
    growthProfitability: {
      revenueGrowthYoy: null,
      netIncomeGrowthYoy: null,
      grossMargin: null,
      operatingMargin: null,
      profitMargin: null,
      roe: null,
      roa: null,
    },
    financialHealth: {
      totalDebt: null,
      totalAssets: null,
      debtToAssets: null,
      currentRatio: null,
      quickRatio: null,
      freeCashflow: null,
    },
    statements: {},
    ...(error ? { error } : {}),
  };
}

async function fetchJson(url: string): Promise<JsonFetchResult> {
  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      cache: "no-store",
    });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function parseTimeseriesMap(payload: unknown): Map<string, TimeseriesPoint[]> {
  const map = new Map<string, TimeseriesPoint[]>();
  const result = asRecord(asRecord(payload).timeseries).result;
  if (!Array.isArray(result)) return map;

  for (const block of result) {
    const blockObj = asRecord(block);
    const metaType = (asRecord(blockObj.meta).type as unknown[] | undefined)?.[0];
    if (typeof metaType !== "string" || !metaType.length) continue;
    const rows = blockObj[metaType];
    if (!Array.isArray(rows)) continue;

    const points: TimeseriesPoint[] = [];
    for (const row of rows) {
      const rowObj = asRecord(row);
      const asOfDate = asString(rowObj.asOfDate);
      const value = rawNum(rowObj.reportedValue);
      if (!asOfDate || value === null) continue;
      points.push({ asOfDate, value });
    }
    if (!points.length) continue;
    points.sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
    map.set(metaType, points);
  }

  return map;
}

function latestValue(series: Map<string, TimeseriesPoint[]>, ...types: string[]): number | null {
  for (const type of types) {
    const points = series.get(type);
    if (!points?.length) continue;
    return points[points.length - 1].value;
  }
  return null;
}

function previousValue(series: Map<string, TimeseriesPoint[]>, ...types: string[]): number | null {
  for (const type of types) {
    const points = series.get(type);
    if (!points || points.length < 2) continue;
    return points[points.length - 2].value;
  }
  return null;
}

function seriesToObject(series: Map<string, TimeseriesPoint[]>): Record<string, TimeseriesPoint[]> {
  const out: Record<string, TimeseriesPoint[]> = {};
  for (const [key, points] of series.entries()) out[key] = points;
  return out;
}

function findSearchQuote(payload: unknown, symbol: string): Record<string, unknown> {
  const quotes = asRecord(payload).quotes;
  if (!Array.isArray(quotes) || !quotes.length) return {};
  const normalized = symbol.toUpperCase();
  for (const quote of quotes) {
    const q = asRecord(quote);
    const quoteSymbol = asString(q.symbol);
    if (quoteSymbol && quoteSymbol.toUpperCase() === normalized) return q;
  }
  return asRecord(quotes[0]);
}

function fromQuoteSummary(symbol: string, payload: unknown): FundamentalsSnapshot | null {
  const result = asRecord(firstArrayItem(asRecord(asRecord(payload).quoteSummary).result));
  if (!Object.keys(result).length) return null;

  const price = asRecord(result.price);
  const summaryDetail = asRecord(result.summaryDetail);
  const financialData = asRecord(result.financialData);
  const stats = asRecord(result.defaultKeyStatistics);
  const income = asRecord(result.incomeStatementHistory);
  const balance = asRecord(result.balanceSheetHistory);

  const [revCur, revPrev] = readIncome(income, "totalRevenue");
  const [niCur, niPrev] = readIncome(income, "netIncome");
  const totalDebt = readBalance(balance, "totalDebt");
  const totalAssets = readBalance(balance, "totalAssets");
  const debtToAssets = safeDiv(totalDebt, totalAssets);

  return {
    symbol,
    valuation: {
      marketCap: rawNum(price.marketCap),
      trailingPE: rawNum(summaryDetail.trailingPE),
      forwardPE: rawNum(summaryDetail.forwardPE),
      priceToBook: rawNum(defaultKey(stats, summaryDetail, "priceToBook")),
      enterpriseToRevenue: rawNum(stats.enterpriseToRevenue),
      enterpriseToEbitda: rawNum(stats.enterpriseToEbitda),
    },
    growthProfitability: {
      revenueGrowthYoy: yoy(revCur, revPrev),
      netIncomeGrowthYoy: yoy(niCur, niPrev),
      grossMargin: rawNum(financialData.grossMargins),
      operatingMargin: rawNum(financialData.operatingMargins),
      profitMargin: rawNum(financialData.profitMargins),
      roe: rawNum(financialData.returnOnEquity),
      roa: rawNum(financialData.returnOnAssets),
    },
    financialHealth: {
      totalDebt,
      totalAssets,
      debtToAssets,
      currentRatio: rawNum(financialData.currentRatio),
      quickRatio: rawNum(financialData.quickRatio),
      freeCashflow: rawNum(financialData.freeCashflow),
    },
    statements: {
      incomeStatementHistory: income,
      balanceSheetHistory: balance,
    },
  };
}

function toFallbackSnapshot(
  symbol: string,
  quoteSummaryStatus: number,
  quoteSummaryReason: string | null,
  timeseriesRes: JsonFetchResult,
  chartRes: JsonFetchResult,
  searchRes: JsonFetchResult,
  insightsRes: JsonFetchResult,
): FundamentalsSnapshot {
  const series = parseTimeseriesMap(timeseriesRes.data);
  const chartMeta = asRecord(firstArrayItem(asRecord(asRecord(chartRes.data).chart).result)).meta;
  const chart = asRecord(chartMeta);
  const searchQuote = findSearchQuote(searchRes.data, symbol);
  const insights = asRecord(asRecord(insightsRes.data).finance).result;
  const insightsResult = asRecord(insights);
  const recommendation = asRecord(asRecord(insightsResult.instrumentInfo).recommendation);

  const marketPrice = firstNonNull(
    rawNum(chart.regularMarketPrice),
    rawNum(searchQuote.regularMarketPrice),
    rawNum(chart.previousClose),
  );
  const trailingEps = firstNonNull(
    latestValue(series, "trailingDilutedEPS", "trailingBasicEPS"),
    latestValue(series, "annualDilutedEPS", "annualBasicEPS"),
  );
  const forwardEps = latestValue(series, "forwardEps");

  const sharesOutstanding = latestValue(
    series,
    "annualOrdinarySharesNumber",
    "quarterlyOrdinarySharesNumber",
    "annualDilutedAverageShares",
    "quarterlyDilutedAverageShares",
    "annualBasicAverageShares",
    "quarterlyBasicAverageShares",
  );
  const derivedMarketCap =
    marketPrice !== null && sharesOutstanding !== null ? marketPrice * sharesOutstanding : null;
  const marketCap = firstNonNull(rawNum(searchQuote.marketCap), derivedMarketCap);

  const totalRevenue = latestValue(series, "annualTotalRevenue", "quarterlyTotalRevenue");
  const totalRevenuePrev = previousValue(series, "annualTotalRevenue", "quarterlyTotalRevenue");
  const netIncome = latestValue(
    series,
    "annualNetIncome",
    "annualNetIncomeCommonStockholders",
    "quarterlyNetIncome",
    "quarterlyNetIncomeCommonStockholders",
  );
  const netIncomePrev = previousValue(
    series,
    "annualNetIncome",
    "annualNetIncomeCommonStockholders",
    "quarterlyNetIncome",
    "quarterlyNetIncomeCommonStockholders",
  );
  const grossProfit = latestValue(series, "annualGrossProfit", "quarterlyGrossProfit");
  const operatingIncome = latestValue(series, "annualOperatingIncome", "quarterlyOperatingIncome");
  const ebitda = latestValue(series, "annualEBITDA", "quarterlyEBITDA");

  const totalAssets = latestValue(series, "annualTotalAssets");
  const totalDebt = firstNonNull(
    latestValue(series, "annualTotalDebt"),
    sumKnown(
      latestValue(series, "annualCurrentDebtAndCapitalLeaseObligation"),
      latestValue(series, "annualLongTermDebtAndCapitalLeaseObligation"),
    ),
  );
  const stockholdersEquity = latestValue(
    series,
    "annualStockholdersEquity",
    "annualCommonStockEquity",
    "annualTotalEquityGrossMinorityInterest",
    "quarterlyStockholdersEquity",
    "quarterlyCommonStockEquity",
    "quarterlyTotalEquityGrossMinorityInterest",
  );
  const cashAndEq = latestValue(series, "annualCashAndCashEquivalents", "quarterlyCashAndCashEquivalents");
  const currentAssets = latestValue(series, "annualCurrentAssets");
  const currentLiabilities = latestValue(series, "annualCurrentLiabilities");
  const inventory = latestValue(series, "annualInventory", "quarterlyInventory");

  const enterpriseValue =
    marketCap !== null ? marketCap + (totalDebt ?? 0) - (cashAndEq ?? 0) : null;
  const currentRatio = safeDiv(currentAssets, currentLiabilities);
  const quickAssets =
    currentAssets !== null && inventory !== null ? currentAssets - inventory : null;
  const quickRatio = safeDiv(quickAssets, currentLiabilities);

  const snapshot: FundamentalsSnapshot = {
    symbol,
    valuation: {
      marketCap,
      trailingPE: firstNonNull(rawNum(searchQuote.trailingPE), safeDiv(marketPrice, trailingEps)),
      forwardPE: firstNonNull(rawNum(searchQuote.forwardPE), safeDiv(marketPrice, forwardEps)),
      priceToBook: firstNonNull(rawNum(searchQuote.priceToBook), safeDiv(marketCap, stockholdersEquity)),
      enterpriseToRevenue: safeDiv(enterpriseValue, totalRevenue),
      enterpriseToEbitda: safeDiv(enterpriseValue, ebitda),
    },
    growthProfitability: {
      revenueGrowthYoy: yoy(totalRevenue, totalRevenuePrev),
      netIncomeGrowthYoy: yoy(netIncome, netIncomePrev),
      grossMargin: safeDiv(grossProfit, totalRevenue),
      operatingMargin: safeDiv(operatingIncome, totalRevenue),
      profitMargin: safeDiv(netIncome, totalRevenue),
      roe: safeDiv(netIncome, stockholdersEquity),
      roa: safeDiv(netIncome, totalAssets),
    },
    financialHealth: {
      totalDebt,
      totalAssets,
      debtToAssets: safeDiv(totalDebt, totalAssets),
      currentRatio,
      quickRatio,
      freeCashflow: latestValue(series, "annualFreeCashFlow", "quarterlyFreeCashFlow"),
    },
    statements: {
      source: "yahoo-fallback",
      quoteSummary: {
        status: quoteSummaryStatus,
        reason: quoteSummaryReason,
      },
      endpointStatus: {
        timeseries: timeseriesRes.status,
        chart: chartRes.status,
        search: searchRes.status,
        insights: insightsRes.status,
      },
      profile: {
        shortName: asString(searchQuote.shortname),
        longName: asString(searchQuote.longname) ?? asString(chart.longName),
        sector: asString(searchQuote.sector),
        industry: asString(searchQuote.industry),
        exchange: asString(searchQuote.exchange) ?? asString(chart.exchangeName),
        currency: asString(chart.currency),
      },
      recommendation: {
        rating: asString(recommendation.rating),
        targetPrice: rawNum(recommendation.targetPrice),
      },
      chart: {
        regularMarketPrice: rawNum(chart.regularMarketPrice),
        previousClose: rawNum(chart.previousClose),
        fiftyTwoWeekHigh: rawNum(chart.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: rawNum(chart.fiftyTwoWeekLow),
        regularMarketVolume: rawNum(chart.regularMarketVolume),
      },
      timeseries: seriesToObject(series),
    },
  };

  if (!hasAnySignal(snapshot)) {
    const reasons = [
      quoteSummaryStatus ? `quoteSummary=${quoteSummaryStatus}` : null,
      quoteSummaryReason ? `reason=${quoteSummaryReason}` : null,
      `timeseries=${timeseriesRes.status}`,
      `chart=${chartRes.status}`,
      `search=${searchRes.status}`,
      `insights=${insightsRes.status}`,
    ]
      .filter(Boolean)
      .join(", ");
    snapshot.error = `Fundamentals data is limited (${reasons})`;
  }

  return snapshot;
}

export async function fetchFundamentalSnapshot(symbol: string): Promise<FundamentalsSnapshot> {
  const modules = [
    "price",
    "summaryDetail",
    "financialData",
    "defaultKeyStatistics",
    "incomeStatementHistory",
    "balanceSheetHistory",
  ].join(",");
  const endpoint = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    symbol,
  )}?modules=${encodeURIComponent(modules)}`;

  const primary = await fetchJson(endpoint);
  const primaryReason = parseYahooError(primary.data);
  if (primary.ok) {
    const parsed = fromQuoteSummary(symbol, primary.data);
    if (parsed) return parsed;
  }

  const now = Math.floor(Date.now() / 1000);
  const period1 = now - 3600 * 24 * 365 * 10;
  const timeseriesEndpoint = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
    symbol,
  )}?type=${encodeURIComponent(TIMESERIES_TYPES.join(","))}&period1=${period1}&period2=${now}`;
  const chartEndpoint = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const searchEndpoint = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}`;
  const insightsEndpoint = `https://query2.finance.yahoo.com/ws/insights/v1/finance/insights?symbol=${encodeURIComponent(
    symbol,
  )}`;

  const [timeseriesRes, chartRes, searchRes, insightsRes] = await Promise.all([
    fetchJson(timeseriesEndpoint),
    fetchJson(chartEndpoint),
    fetchJson(searchEndpoint),
    fetchJson(insightsEndpoint),
  ]);

  const fallback = toFallbackSnapshot(
    symbol,
    primary.status,
    primaryReason,
    timeseriesRes,
    chartRes,
    searchRes,
    insightsRes,
  );

  if (hasAnySignal(fallback)) return fallback;
  return emptySnapshot(symbol, fallback.error ?? `Fundamentals API error: ${primary.status || 0}`);
}

function defaultKey(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  key: string,
): unknown {
  if (key in left) return left[key];
  return right[key];
}
