import { toFiniteNumber } from "@/lib/data/common";
import type { FundamentalsSnapshot } from "@/lib/types";

function rawNum(v: unknown): number | null {
  if (v && typeof v === "object" && "raw" in (v as Record<string, unknown>)) {
    return toFiniteNumber((v as { raw?: unknown }).raw);
  }
  return toFiniteNumber(v);
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

  const response = await fetch(endpoint, {
    headers: { "User-Agent": "tradins-next/0.1" },
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      symbol,
      valuation: {},
      growthProfitability: {},
      financialHealth: {},
      statements: {},
      error: `Fundamentals API error: ${response.status}`,
    };
  }

  const payload = await response.json();
  const result = payload?.quoteSummary?.result?.[0] ?? {};
  const price = result?.price ?? {};
  const summaryDetail = result?.summaryDetail ?? {};
  const financialData = result?.financialData ?? {};
  const stats = result?.defaultKeyStatistics ?? {};
  const income = result?.incomeStatementHistory ?? {};
  const balance = result?.balanceSheetHistory ?? {};

  const [revCur, revPrev] = readIncome(income, "totalRevenue");
  const [niCur, niPrev] = readIncome(income, "netIncome");
  const totalDebt = readBalance(balance, "totalDebt");
  const totalAssets = readBalance(balance, "totalAssets");
  const debtToAssets =
    totalDebt !== null && totalAssets !== null && totalAssets !== 0
      ? totalDebt / totalAssets
      : null;

  return {
    symbol,
    valuation: {
      marketCap: rawNum(price?.marketCap),
      trailingPE: rawNum(summaryDetail?.trailingPE),
      forwardPE: rawNum(summaryDetail?.forwardPE),
      priceToBook: rawNum(defaultKey(stats, summaryDetail, "priceToBook")),
      enterpriseToRevenue: rawNum(stats?.enterpriseToRevenue),
      enterpriseToEbitda: rawNum(stats?.enterpriseToEbitda),
    },
    growthProfitability: {
      revenueGrowthYoy: yoy(revCur, revPrev),
      netIncomeGrowthYoy: yoy(niCur, niPrev),
      grossMargin: rawNum(financialData?.grossMargins),
      operatingMargin: rawNum(financialData?.operatingMargins),
      profitMargin: rawNum(financialData?.profitMargins),
      roe: rawNum(financialData?.returnOnEquity),
      roa: rawNum(financialData?.returnOnAssets),
    },
    financialHealth: {
      totalDebt,
      totalAssets,
      debtToAssets,
      currentRatio: rawNum(financialData?.currentRatio),
      quickRatio: rawNum(financialData?.quickRatio),
      freeCashflow: rawNum(financialData?.freeCashflow),
    },
    statements: {
      incomeStatementHistory: income,
      balanceSheetHistory: balance,
    },
  };
}

function defaultKey(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  key: string,
): unknown {
  if (key in left) return left[key];
  return right[key];
}
