import { resolveAShareSymbol } from "@/lib/data/a-share";
import { toFiniteNumber } from "@/lib/data/common";
import { resolveInstrumentContext } from "@/lib/instruments";
import type { FundamentalsSnapshot } from "@/lib/types";

const REQUEST_HEADERS = { "User-Agent": "tradins-next/0.1" } as const;
const EASTMONEY_HEADERS = {
  "User-Agent": "tradins-next/0.1",
  Referer: "https://emweb.securities.eastmoney.com/",
} as const;

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

function pctToRatio(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n === null) return null;
  return Math.abs(n) > 1 ? n / 100 : n;
}

function annualizeFromReportType(value: number | null, reportType: string | null): number | null {
  if (value === null) return null;
  if (!reportType) return value;
  if (reportType.includes("一季")) return value * 4;
  if (reportType.includes("半年") || reportType.includes("中报")) return value * 2;
  if (reportType.includes("三季")) return value * (4 / 3);
  return value;
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

function classifySourceIssue(reason: string | null): string {
  if (!reason) return "主数据源暂不可用";
  const normalized = reason.toLowerCase();
  if (
    normalized.includes("invalid crumb") ||
    normalized.includes("auth") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return "数据源鉴权受限";
  }
  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("429")
  ) {
    return "数据源请求限流";
  }
  if (
    normalized.includes("not found") ||
    normalized.includes("no data") ||
    normalized.includes("symbol")
  ) {
    return "标的数据可用性不足";
  }
  return "数据源接口异常";
}

function formatSourceStatus(status: Record<string, number>): string {
  return Object.entries(status)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function friendlyFundamentalsError(status: Record<string, number>, reason: string | null): string {
  const issue = classifySourceIssue(reason);
  const statusText = formatSourceStatus(status);
  const suffix = statusText ? `（${statusText}）` : "";
  return `基础面数据暂不完整：${issue}，系统已自动尝试备用信息源。建议降低基本面结论置信度，并结合市场、新闻与舆情信号综合判断${suffix}。`;
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

async function fetchJson(url: string, headers: Record<string, string> = REQUEST_HEADERS): Promise<JsonFetchResult> {
  try {
    const response = await fetch(url, {
      headers,
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

function findQuoteV7(payload: unknown, symbol: string): Record<string, unknown> {
  const rows = asRecord(asRecord(payload).quoteResponse).result;
  if (!Array.isArray(rows) || !rows.length) return {};
  const normalized = symbol.toUpperCase();
  for (const row of rows) {
    const quote = asRecord(row);
    const quoteSymbol = asString(quote.symbol);
    if (quoteSymbol && quoteSymbol.toUpperCase() === normalized) return quote;
  }
  return asRecord(rows[0]);
}

function fromQuoteSummary(symbol: string, payload: unknown): FundamentalsSnapshot | null {
  const result = asRecord(firstArrayItem(asRecord(asRecord(payload).quoteSummary).result));
  if (!Object.keys(result).length) return null;

  const price = asRecord(result.price);
  const summaryDetail = asRecord(result.summaryDetail);
  const financialData = asRecord(result.financialData);
  const stats = asRecord(result.defaultKeyStatistics);
  const assetProfile = asRecord(result.assetProfile);
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
      source: "yahoo-quote-summary",
      profile: {
        shortName: asString(price.shortName),
        longName: asString(price.longName),
        sector: asString(assetProfile.sector),
        industry: asString(assetProfile.industry),
        exchange: asString(price.exchangeName),
        currency: asString(price.currency),
        description: asString(assetProfile.longBusinessSummary),
        website: asString(assetProfile.website),
      },
      incomeStatementHistory: income,
      balanceSheetHistory: balance,
    },
  };
}

function toQuoteV7BackupSnapshot(
  symbol: string,
  lookupSymbol: string,
  quoteRes: JsonFetchResult,
  chartRes: JsonFetchResult,
  searchRes: JsonFetchResult,
): FundamentalsSnapshot | null {
  const quote = findQuoteV7(quoteRes.data, lookupSymbol);
  const chartMeta = asRecord(firstArrayItem(asRecord(asRecord(chartRes.data).chart).result)).meta;
  const chart = asRecord(chartMeta);
  const searchQuote = findSearchQuote(searchRes.data, lookupSymbol);

  const marketPrice = firstNonNull(
    rawNum(quote.regularMarketPrice),
    rawNum(chart.regularMarketPrice),
    rawNum(searchQuote.regularMarketPrice),
    rawNum(chart.previousClose),
  );
  const marketCap = firstNonNull(rawNum(quote.marketCap), rawNum(searchQuote.marketCap));
  const totalRevenue = firstNonNull(rawNum(quote.totalRevenue), rawNum(searchQuote.totalRevenue));
  const netIncome = firstNonNull(rawNum(quote.netIncomeToCommon), rawNum(searchQuote.netIncomeToCommon));
  const totalDebt = firstNonNull(rawNum(quote.totalDebt), rawNum(searchQuote.totalDebt));
  const totalAssets = firstNonNull(rawNum(quote.totalAssets), rawNum(searchQuote.totalAssets));
  const stockholdersEquity = firstNonNull(rawNum(quote.bookValue), rawNum(searchQuote.bookValue));

  const snapshot: FundamentalsSnapshot = {
    symbol,
    valuation: {
      marketCap,
      trailingPE: firstNonNull(rawNum(quote.trailingPE), rawNum(searchQuote.trailingPE)),
      forwardPE: firstNonNull(rawNum(quote.forwardPE), rawNum(searchQuote.forwardPE)),
      priceToBook: firstNonNull(rawNum(quote.priceToBook), rawNum(searchQuote.priceToBook)),
      enterpriseToRevenue: firstNonNull(rawNum(quote.enterpriseToRevenue), rawNum(searchQuote.enterpriseToRevenue)),
      enterpriseToEbitda: firstNonNull(rawNum(quote.enterpriseToEbitda), rawNum(searchQuote.enterpriseToEbitda)),
    },
    growthProfitability: {
      revenueGrowthYoy: firstNonNull(rawNum(quote.revenueGrowth), rawNum(searchQuote.revenueGrowth)),
      netIncomeGrowthYoy: firstNonNull(rawNum(quote.earningsGrowth), rawNum(searchQuote.earningsGrowth)),
      grossMargin: firstNonNull(rawNum(quote.grossMargins), rawNum(searchQuote.grossMargins)),
      operatingMargin: firstNonNull(rawNum(quote.operatingMargins), rawNum(searchQuote.operatingMargins)),
      profitMargin: firstNonNull(rawNum(quote.profitMargins), rawNum(searchQuote.profitMargins)),
      roe: firstNonNull(rawNum(quote.returnOnEquity), rawNum(searchQuote.returnOnEquity)),
      roa: firstNonNull(rawNum(quote.returnOnAssets), rawNum(searchQuote.returnOnAssets)),
    },
    financialHealth: {
      totalDebt,
      totalAssets,
      debtToAssets: safeDiv(totalDebt, totalAssets),
      currentRatio: firstNonNull(rawNum(quote.currentRatio), rawNum(searchQuote.currentRatio)),
      quickRatio: firstNonNull(rawNum(quote.quickRatio), rawNum(searchQuote.quickRatio)),
      freeCashflow: firstNonNull(rawNum(quote.freeCashflow), rawNum(searchQuote.freeCashflow)),
    },
    statements: {
      source: "yahoo-quote-v7-backup",
      endpointStatus: {
        quote: quoteRes.status,
        chart: chartRes.status,
        search: searchRes.status,
      },
      profile: {
        shortName: asString(quote.shortName) ?? asString(searchQuote.shortname),
        longName: asString(quote.longName) ?? asString(searchQuote.longname) ?? asString(chart.longName),
        sector: asString(quote.sector) ?? asString(searchQuote.sector),
        industry: asString(quote.industry) ?? asString(searchQuote.industry),
        exchange: asString(quote.fullExchangeName) ?? asString(searchQuote.exchange) ?? asString(chart.exchangeName),
        currency: asString(quote.currency) ?? asString(chart.currency),
      },
      chart: {
        regularMarketPrice: marketPrice,
        previousClose: rawNum(quote.regularMarketPreviousClose) ?? rawNum(chart.previousClose),
        fiftyTwoWeekHigh: rawNum(quote.fiftyTwoWeekHigh) ?? rawNum(chart.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: rawNum(quote.fiftyTwoWeekLow) ?? rawNum(chart.fiftyTwoWeekLow),
        regularMarketVolume: rawNum(quote.regularMarketVolume) ?? rawNum(chart.regularMarketVolume),
      },
      quote,
    },
  };

  return hasAnySignal(snapshot) ? snapshot : null;
}

function latestEastmoneyClose(payload: unknown): number | null {
  const rows = asRecord(asRecord(payload).data).klines;
  if (!Array.isArray(rows) || !rows.length) return null;
  const last = String(rows[rows.length - 1] ?? "");
  const parts = last.split(",");
  if (parts.length < 3) return null;
  return toFiniteNumber(parts[2]);
}

function firstDataRow(payload: unknown): Record<string, unknown> {
  const rows = asRecord(asRecord(payload).result).data;
  if (!Array.isArray(rows) || !rows.length) return {};
  return asRecord(rows[0]);
}

async function fetchAShareFundamentalSnapshot(symbol: string): Promise<FundamentalsSnapshot | null> {
  const ashare = resolveAShareSymbol(symbol);
  if (!ashare) return null;

  const filter = encodeURIComponent(`(SECUCODE="${ashare.secuCode}")`);
  const zyzbEndpoint = `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?type=0&code=${encodeURIComponent(
    ashare.emCode,
  )}`;
  const balanceEndpoint =
    `https://datacenter.eastmoney.com/securities/api/data/v1/get?` +
    `reportName=RPT_F10_FINANCE_GBALANCE&columns=ALL&quoteColumns=&filter=${filter}` +
    `&pageNumber=1&pageSize=1&sortTypes=-1&sortColumns=REPORT_DATE&source=HSF10&client=PC`;
  const incomeEndpoint =
    `https://datacenter.eastmoney.com/securities/api/data/v1/get?` +
    `reportName=RPT_F10_FINANCE_GINCOMEQC&columns=ALL&quoteColumns=&filter=${filter}` +
    `&pageNumber=1&pageSize=1&sortTypes=-1&sortColumns=REPORT_DATE&source=HSF10&client=PC`;
  const orgEndpoint =
    `https://datacenter.eastmoney.com/securities/api/data/v1/get?` +
    `reportName=RPT_HSF9_BASIC_ORGINFO&columns=ALL&quoteColumns=&filter=${filter}` +
    `&pageNumber=1&pageSize=1&source=HSF10&client=PC`;
  const closeEndpoint =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?` +
    `secid=${encodeURIComponent(ashare.secid)}` +
    `&klt=101&fqt=1&beg=19900101&end=20500101&lmt=2` +
    `&ut=fa5fd1943c7b386f172d6893dbfba10b` +
    `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;

  const [zyzbRes, balanceRes, incomeRes, orgRes, closeRes] = await Promise.all([
    fetchJson(zyzbEndpoint, EASTMONEY_HEADERS),
    fetchJson(balanceEndpoint, EASTMONEY_HEADERS),
    fetchJson(incomeEndpoint, EASTMONEY_HEADERS),
    fetchJson(orgEndpoint, EASTMONEY_HEADERS),
    fetchJson(closeEndpoint, EASTMONEY_HEADERS),
  ]);

  const zyzbRows = asRecord(zyzbRes.data).data;
  const zyzb = asRecord(firstArrayItem(zyzbRows));
  const balance = firstDataRow(balanceRes.data);
  const income = firstDataRow(incomeRes.data);
  const org = firstDataRow(orgRes.data);
  const latestClose = latestEastmoneyClose(closeRes.data);

  const reportType = asString(zyzb.REPORT_TYPE) ?? asString(zyzb.REPORT_DATE_NAME);
  const reportRevenue = rawNum(zyzb.TOTALOPERATEREVE);
  const reportNetIncome = firstNonNull(rawNum(zyzb.PARENTNETPROFIT), rawNum(zyzb.KCFJCXSYJLR));
  const annualRevenue = annualizeFromReportType(reportRevenue, reportType);
  const annualNetIncome = annualizeFromReportType(reportNetIncome, reportType);
  const incomeReportType = asString(income.REPORT_TYPE) ?? reportType;
  const annualOperatingProfit = annualizeFromReportType(
    firstNonNull(rawNum(income.OPERATE_PROFIT), rawNum(income.TOTAL_PROFIT)),
    incomeReportType,
  );

  const totalShares = firstNonNull(rawNum(org.REG_CAPITALY), rawNum(balance.SHARE_CAPITAL));
  const marketCap = latestClose !== null && totalShares !== null ? latestClose * totalShares : null;
  const totalAssets = firstNonNull(rawNum(balance.TOTAL_ASSETS), rawNum(balance.TOTAL_LIAB_EQUITY));
  const totalDebt = firstNonNull(rawNum(balance.TOTAL_LIABILITIES), rawNum(zyzb.LIABILITY));
  const stockholdersEquity = firstNonNull(rawNum(balance.TOTAL_PARENT_EQUITY), rawNum(balance.TOTAL_EQUITY));
  const cashAndEq = rawNum(balance.MONETARYFUNDS);
  const enterpriseValue =
    marketCap !== null ? marketCap + (totalDebt ?? 0) - (cashAndEq ?? 0) : null;
  const currentAssets = rawNum(balance.TOTAL_CURRENT_ASSETS);
  const currentLiabilities = rawNum(balance.TOTAL_CURRENT_LIAB);
  const inventory = rawNum(balance.INVENTORY);
  const derivedCurrentRatio = safeDiv(currentAssets, currentLiabilities);
  const quickAssets =
    currentAssets !== null && inventory !== null ? currentAssets - inventory : null;
  const derivedQuickRatio = safeDiv(quickAssets, currentLiabilities);

  const snapshot: FundamentalsSnapshot = {
    symbol,
    valuation: {
      marketCap,
      trailingPE: safeDiv(marketCap, annualNetIncome),
      forwardPE: null,
      priceToBook: safeDiv(marketCap, stockholdersEquity),
      enterpriseToRevenue: safeDiv(enterpriseValue, annualRevenue),
      enterpriseToEbitda: null,
    },
    growthProfitability: {
      revenueGrowthYoy: pctToRatio(zyzb.TOTALOPERATEREVETZ),
      netIncomeGrowthYoy: pctToRatio(zyzb.PARENTNETPROFITTZ),
      grossMargin: pctToRatio(zyzb.XSMLL),
      operatingMargin: safeDiv(annualOperatingProfit, annualRevenue),
      profitMargin: firstNonNull(pctToRatio(zyzb.XSJLL), safeDiv(annualNetIncome, annualRevenue)),
      roe: firstNonNull(pctToRatio(zyzb.ROEJQ), safeDiv(annualNetIncome, stockholdersEquity)),
      roa: firstNonNull(pctToRatio(zyzb.ZZCJLL), safeDiv(annualNetIncome, totalAssets)),
    },
    financialHealth: {
      totalDebt,
      totalAssets,
      debtToAssets: firstNonNull(safeDiv(totalDebt, totalAssets), pctToRatio(zyzb.ZCFZL)),
      currentRatio: firstNonNull(rawNum(zyzb.LD), derivedCurrentRatio),
      quickRatio: firstNonNull(rawNum(zyzb.SD), derivedQuickRatio),
      freeCashflow: firstNonNull(rawNum(zyzb.FCFF_FORWARD), rawNum(zyzb.FCFF_BACK)),
    },
    statements: {
      source: "eastmoney-ashare",
      profile: {
        securityCode: ashare.code,
        secuCode: ashare.secuCode,
        securityName: asString(zyzb.SECURITY_NAME_ABBR) ?? asString(org.SECURITY_NAME_ABBR),
        industry: asString(org.INDUSTRYCSRC1),
      },
      endpointStatus: {
        zyzb: zyzbRes.status,
        balance: balanceRes.status,
        income: incomeRes.status,
        org: orgRes.status,
        close: closeRes.status,
      },
      reportType,
      latestClose,
      zyzb,
      balance,
      income,
      org,
    },
  };

  if (!hasAnySignal(snapshot)) {
    snapshot.error = `A-share fundamentals unavailable (zyzb=${zyzbRes.status}, balance=${balanceRes.status}, income=${incomeRes.status}, org=${orgRes.status}, close=${closeRes.status})`;
  }

  return snapshot;
}

function toFallbackSnapshot(
  symbol: string,
  lookupSymbol: string,
  quoteSummaryStatus: number,
  quoteSummaryReason: string | null,
  timeseriesRes: JsonFetchResult,
  chartRes: JsonFetchResult,
  searchRes: JsonFetchResult,
  quoteRes: JsonFetchResult,
  insightsRes: JsonFetchResult,
): FundamentalsSnapshot {
  const series = parseTimeseriesMap(timeseriesRes.data);
  const chartMeta = asRecord(firstArrayItem(asRecord(asRecord(chartRes.data).chart).result)).meta;
  const chart = asRecord(chartMeta);
  const searchQuote = findSearchQuote(searchRes.data, lookupSymbol);
  const quoteV7 = findQuoteV7(quoteRes.data, lookupSymbol);
  const insights = asRecord(asRecord(insightsRes.data).finance).result;
  const insightsResult = asRecord(insights);
  const recommendation = asRecord(asRecord(insightsResult.instrumentInfo).recommendation);

  const marketPrice = firstNonNull(
    rawNum(quoteV7.regularMarketPrice),
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
  const marketCap = firstNonNull(rawNum(quoteV7.marketCap), rawNum(searchQuote.marketCap), derivedMarketCap);

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
      trailingPE: firstNonNull(
        rawNum(quoteV7.trailingPE),
        rawNum(searchQuote.trailingPE),
        safeDiv(marketPrice, trailingEps),
      ),
      forwardPE: firstNonNull(
        rawNum(quoteV7.forwardPE),
        rawNum(searchQuote.forwardPE),
        safeDiv(marketPrice, forwardEps),
      ),
      priceToBook: firstNonNull(
        rawNum(quoteV7.priceToBook),
        rawNum(searchQuote.priceToBook),
        safeDiv(marketCap, stockholdersEquity),
      ),
      enterpriseToRevenue: safeDiv(enterpriseValue, totalRevenue),
      enterpriseToEbitda: safeDiv(enterpriseValue, ebitda),
    },
    growthProfitability: {
      revenueGrowthYoy: firstNonNull(rawNum(quoteV7.revenueGrowth), yoy(totalRevenue, totalRevenuePrev)),
      netIncomeGrowthYoy: firstNonNull(rawNum(quoteV7.earningsGrowth), yoy(netIncome, netIncomePrev)),
      grossMargin: firstNonNull(rawNum(quoteV7.grossMargins), safeDiv(grossProfit, totalRevenue)),
      operatingMargin: firstNonNull(rawNum(quoteV7.operatingMargins), safeDiv(operatingIncome, totalRevenue)),
      profitMargin: firstNonNull(rawNum(quoteV7.profitMargins), safeDiv(netIncome, totalRevenue)),
      roe: firstNonNull(rawNum(quoteV7.returnOnEquity), safeDiv(netIncome, stockholdersEquity)),
      roa: firstNonNull(rawNum(quoteV7.returnOnAssets), safeDiv(netIncome, totalAssets)),
    },
    financialHealth: {
      totalDebt: firstNonNull(rawNum(quoteV7.totalDebt), totalDebt),
      totalAssets: firstNonNull(rawNum(quoteV7.totalAssets), totalAssets),
      debtToAssets: safeDiv(firstNonNull(rawNum(quoteV7.totalDebt), totalDebt), firstNonNull(rawNum(quoteV7.totalAssets), totalAssets)),
      currentRatio: firstNonNull(rawNum(quoteV7.currentRatio), currentRatio),
      quickRatio: firstNonNull(rawNum(quoteV7.quickRatio), quickRatio),
      freeCashflow: firstNonNull(rawNum(quoteV7.freeCashflow), latestValue(series, "annualFreeCashFlow", "quarterlyFreeCashFlow")),
    },
    statements: {
      source: "yahoo-fallback-mixed",
      quoteSummary: {
        status: quoteSummaryStatus,
        reason: quoteSummaryReason,
      },
      endpointStatus: {
        timeseries: timeseriesRes.status,
        chart: chartRes.status,
        search: searchRes.status,
        quote: quoteRes.status,
        insights: insightsRes.status,
      },
      profile: {
        shortName: asString(quoteV7.shortName) ?? asString(searchQuote.shortname),
        longName: asString(searchQuote.longname) ?? asString(chart.longName),
        sector: asString(quoteV7.sector) ?? asString(searchQuote.sector),
        industry: asString(quoteV7.industry) ?? asString(searchQuote.industry),
        exchange: asString(searchQuote.exchange) ?? asString(chart.exchangeName),
        currency: asString(quoteV7.currency) ?? asString(chart.currency),
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
      quoteV7: quoteV7,
      timeseries: seriesToObject(series),
    },
  };

  if (!hasAnySignal(snapshot)) {
    snapshot.error = friendlyFundamentalsError(
      {
        quoteSummary: quoteSummaryStatus,
        timeseries: timeseriesRes.status,
        chart: chartRes.status,
        search: searchRes.status,
        quote: quoteRes.status,
        insights: insightsRes.status,
      },
      quoteSummaryReason,
    );
  }

  return snapshot;
}

export async function fetchFundamentalSnapshot(symbol: string): Promise<FundamentalsSnapshot> {
  const instrument = resolveInstrumentContext(symbol);
  const lookupSymbol = instrument.fundamentalsSymbol;
  const aShareSnapshot = await fetchAShareFundamentalSnapshot(lookupSymbol);
  if (aShareSnapshot && hasAnySignal(aShareSnapshot)) return aShareSnapshot;

  const modules = [
    "price",
    "summaryDetail",
    "financialData",
    "defaultKeyStatistics",
    "incomeStatementHistory",
    "balanceSheetHistory",
    "assetProfile",
  ].join(",");
  const endpoint = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    lookupSymbol,
  )}?modules=${encodeURIComponent(modules)}`;

  const primary = await fetchJson(endpoint);
  const primaryReason = parseYahooError(primary.data);
  if (primary.ok) {
    const parsed = fromQuoteSummary(symbol, primary.data);
    if (parsed) {
      if (lookupSymbol !== symbol) {
        parsed.statements = {
          ...parsed.statements,
          instrument: {
            kind: instrument.kind,
            displayName: instrument.displayName,
            requestedSymbol: symbol,
            dataSymbol: lookupSymbol,
          },
        };
      }
      return parsed;
    }
  }

  const chartEndpoint = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(lookupSymbol)}`;
  const searchEndpoint = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(lookupSymbol)}`;
  const quoteEndpoint = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(lookupSymbol)}`;

  const [quoteRes, chartRes, searchRes] = await Promise.all([
    fetchJson(quoteEndpoint),
    fetchJson(chartEndpoint),
    fetchJson(searchEndpoint),
  ]);

  const quoteBackup = toQuoteV7BackupSnapshot(symbol, lookupSymbol, quoteRes, chartRes, searchRes);
  if (quoteBackup && hasAnySignal(quoteBackup)) {
    if (lookupSymbol !== symbol) {
      quoteBackup.statements = {
        ...quoteBackup.statements,
        instrument: {
          kind: instrument.kind,
          displayName: instrument.displayName,
          requestedSymbol: symbol,
          dataSymbol: lookupSymbol,
        },
      };
    }
    return quoteBackup;
  }

  const now = Math.floor(Date.now() / 1000);
  const period1 = now - 3600 * 24 * 365 * 10;
  const timeseriesEndpoint = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
    lookupSymbol,
  )}?type=${encodeURIComponent(TIMESERIES_TYPES.join(","))}&period1=${period1}&period2=${now}`;
  const insightsEndpoint = `https://query2.finance.yahoo.com/ws/insights/v1/finance/insights?symbol=${encodeURIComponent(
    lookupSymbol,
  )}`;

  const [timeseriesRes, insightsRes] = await Promise.all([
    fetchJson(timeseriesEndpoint),
    fetchJson(insightsEndpoint),
  ]);

  const fallback = toFallbackSnapshot(
    symbol,
    lookupSymbol,
    primary.status,
    primaryReason,
    timeseriesRes,
    chartRes,
    searchRes,
    quoteRes,
    insightsRes,
  );

  if (lookupSymbol !== symbol) {
    fallback.statements = {
      ...fallback.statements,
      instrument: {
        kind: instrument.kind,
        displayName: instrument.displayName,
        requestedSymbol: symbol,
        dataSymbol: lookupSymbol,
      },
    };
  }

  if (hasAnySignal(fallback)) return fallback;
  return emptySnapshot(
    symbol,
    fallback.error ??
      friendlyFundamentalsError(
        {
          quoteSummary: primary.status,
          quote: quoteRes.status,
          chart: chartRes.status,
          search: searchRes.status,
          timeseries: timeseriesRes.status,
          insights: insightsRes.status,
        },
        primaryReason,
      ),
  );
}

function defaultKey(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  key: string,
): unknown {
  if (key in left) return left[key];
  return right[key];
}
