import { eastmoneyKlineParams, resolveAShareSymbol } from "@/lib/data/a-share";
import { toFiniteNumber } from "@/lib/data/common";
import type { MarketSnapshot, TechnicalSnapshot } from "@/lib/types";

type OHLCVPoint = {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const YAHOO_HEADERS = { "User-Agent": "tradins-next/0.1" } as const;
const EASTMONEY_HEADERS = {
  "User-Agent": "tradins-next/0.1",
  Referer: "https://quote.eastmoney.com/",
} as const;

function ema(values: number[], span: number): number[] {
  if (!values.length) return [];
  const alpha = 2 / (span + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    out.push(alpha * values[i] + (1 - alpha) * out[i - 1]);
  }
  return out;
}

function rollingMean(values: number[], window: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i + 1 >= window ? sum / window : null);
  }
  return out;
}

function rollingStd(values: number[], window: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < window) {
      out.push(null);
      continue;
    }
    const start = i + 1 - window;
    const sample = values.slice(start, i + 1);
    const mean = sample.reduce((acc, n) => acc + n, 0) / window;
    const variance = sample.reduce((acc, n) => acc + (n - mean) ** 2, 0) / window;
    out.push(Math.sqrt(variance));
  }
  return out;
}

function rsi(values: number[], window = 14): Array<number | null> {
  if (!values.length) return [];
  const out: Array<number | null> = [null];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    if (i <= window) {
      avgGain += gain;
      avgLoss += loss;
      out.push(null);
      if (i === window) {
        avgGain /= window;
        avgLoss /= window;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out[i] = 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (window - 1) + gain) / window;
      avgLoss = (avgLoss * (window - 1) + loss) / window;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

function classifyTrend(price: number | null, ma20: number | null, ma50: number | null, ma200: number | null): string {
  if (price === null || ma20 === null || ma50 === null) return "unknown";
  if (ma200 !== null && price > ma20 && ma20 > ma50 && ma50 > ma200) return "strong_uptrend";
  if (price > ma20 && ma20 > ma50) return "uptrend";
  if (ma200 !== null && price < ma20 && ma20 < ma50 && ma50 < ma200) return "strong_downtrend";
  if (price < ma20 && ma20 < ma50) return "downtrend";
  return "range_bound";
}

function lastOrNull(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== null) return values[i];
  }
  return null;
}

function emptyTechnicals(): TechnicalSnapshot {
  return {
    price: null,
    changePct1d: null,
    ma20: null,
    ma50: null,
    ma200: null,
    macd: null,
    macdSignal: null,
    macdHist: null,
    rsi14: null,
    bbUpper: null,
    bbMid: null,
    bbLower: null,
    volume: null,
    volumeRatio20d: null,
    support: null,
    resistance: null,
    trend: "unknown",
  };
}

function emptyMarketSnapshot(
  symbol: string,
  period: string,
  interval: string,
  error: string,
): MarketSnapshot {
  return {
    symbol,
    period,
    interval,
    points: 0,
    technicals: emptyTechnicals(),
    recentBars: {},
    error,
  };
}

function parseEastmoneyKlineTimestamp(rawDate: string): number | null {
  if (!rawDate) return null;
  const normalized = rawDate.includes(" ") ? rawDate.replace(" ", "T") : `${rawDate}T00:00:00`;
  const withZone = `${normalized}+08:00`;
  const ms = Date.parse(withZone);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

function parseEastmoneyKlineRow(rawRow: string): OHLCVPoint | null {
  const fields = rawRow.split(",");
  if (fields.length < 6) return null;
  const ts = parseEastmoneyKlineTimestamp(fields[0]);
  const open = toFiniteNumber(fields[1]);
  const close = toFiniteNumber(fields[2]);
  const high = toFiniteNumber(fields[3]);
  const low = toFiniteNumber(fields[4]);
  const volumeHands = toFiniteNumber(fields[5]);
  if (
    ts === null ||
    open === null ||
    close === null ||
    high === null ||
    low === null ||
    volumeHands === null
  ) {
    return null;
  }
  return {
    ts,
    open,
    high,
    low,
    close,
    volume: volumeHands * 100,
  };
}

async function fetchAShareMarketSnapshot(
  symbol: string,
  period: string,
  interval: string,
): Promise<MarketSnapshot | null> {
  const ashare = resolveAShareSymbol(symbol);
  if (!ashare) return null;

  const { klt, beg, end, lmt } = eastmoneyKlineParams(period, interval);
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

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  const rows = (data as { data?: { klines?: unknown[] } })?.data?.klines;
  if (!Array.isArray(rows) || !rows.length) return null;

  const points: OHLCVPoint[] = [];
  for (const row of rows) {
    const point = parseEastmoneyKlineRow(String(row ?? ""));
    if (point) points.push(point);
  }
  if (!points.length) return null;

  const technicals = computeTechnicals(points);
  const recentBars = Object.fromEntries(
    points.slice(-30).map((p) => [
      new Date(p.ts * 1000).toISOString().slice(0, 10),
      {
        Open: Number(p.open.toFixed(4)),
        High: Number(p.high.toFixed(4)),
        Low: Number(p.low.toFixed(4)),
        Close: Number(p.close.toFixed(4)),
        Volume: Math.round(p.volume),
      },
    ]),
  );

  return {
    symbol,
    period,
    interval,
    points: points.length,
    technicals,
    recentBars,
  };
}

function computeTechnicals(points: OHLCVPoint[]): TechnicalSnapshot {
  const close = points.map((p) => p.close);
  const volume = points.map((p) => p.volume);

  const ma20 = rollingMean(close, 20);
  const ma50 = rollingMean(close, 50);
  const ma200 = rollingMean(close, 200);
  const ema12 = ema(close, 12);
  const ema26 = ema(close, 26);
  const macd = ema12.map((v, idx) => v - ema26[idx]);
  const signal = ema(macd, 9);
  const hist = macd.map((v, idx) => v - signal[idx]);
  const rsi14 = rsi(close, 14);
  const bbMid = ma20;
  const bbStd = rollingStd(close, 20);
  const bbUpper = bbMid.map((mid, idx) => (mid === null || bbStd[idx] === null ? null : mid + 2 * bbStd[idx]!));
  const bbLower = bbMid.map((mid, idx) => (mid === null || bbStd[idx] === null ? null : mid - 2 * bbStd[idx]!));

  const price = close.length ? close.at(-1)! : null;
  const prev = close.length > 1 ? close.at(-2)! : null;
  const changePct1d = prev ? (price! - prev) / prev : null;
  const lookback = close.slice(-60);
  const support = lookback.length ? Math.min(...lookback) : null;
  const resistance = lookback.length ? Math.max(...lookback) : null;
  const vma20 = rollingMean(volume, 20);
  const volumeRatio20d =
    volume.length && vma20.at(-1) ? volume.at(-1)! / (vma20.at(-1) as number) : null;

  const ma20Last = lastOrNull(ma20);
  const ma50Last = lastOrNull(ma50);
  const ma200Last = lastOrNull(ma200);
  return {
    price: toFiniteNumber(price),
    changePct1d: toFiniteNumber(changePct1d),
    ma20: toFiniteNumber(ma20Last),
    ma50: toFiniteNumber(ma50Last),
    ma200: toFiniteNumber(ma200Last),
    macd: toFiniteNumber(macd.at(-1)),
    macdSignal: toFiniteNumber(signal.at(-1)),
    macdHist: toFiniteNumber(hist.at(-1)),
    rsi14: toFiniteNumber(lastOrNull(rsi14)),
    bbUpper: toFiniteNumber(lastOrNull(bbUpper)),
    bbMid: toFiniteNumber(lastOrNull(bbMid)),
    bbLower: toFiniteNumber(lastOrNull(bbLower)),
    volume: toFiniteNumber(volume.at(-1)),
    volumeRatio20d: toFiniteNumber(volumeRatio20d),
    support: toFiniteNumber(support),
    resistance: toFiniteNumber(resistance),
    trend: classifyTrend(toFiniteNumber(price), toFiniteNumber(ma20Last), toFiniteNumber(ma50Last), toFiniteNumber(ma200Last)),
  };
}

export async function fetchMarketSnapshot(symbol: string, period = "6mo", interval = "1d"): Promise<MarketSnapshot> {
  const aShareSnapshot = await fetchAShareMarketSnapshot(symbol, period, interval);
  if (aShareSnapshot) return aShareSnapshot;

  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}&includePrePost=false&events=div%2Csplits`;

  const response = await fetch(endpoint, {
    headers: YAHOO_HEADERS,
    cache: "no-store",
  });
  if (!response.ok) {
    return emptyMarketSnapshot(symbol, period, interval, `Market API error: ${response.status}`);
  }

  const data = await response.json();
  const row = data?.chart?.result?.[0];
  const ts: number[] = row?.timestamp ?? [];
  const quote = row?.indicators?.quote?.[0] ?? {};
  const adjClose: number[] | undefined = row?.indicators?.adjclose?.[0]?.adjclose;
  const open = quote?.open ?? [];
  const high = quote?.high ?? [];
  const low = quote?.low ?? [];
  const closeRaw = quote?.close ?? [];
  const close = Array.isArray(adjClose) && adjClose.length === closeRaw.length ? adjClose : closeRaw;
  const volume = quote?.volume ?? [];

  const points: OHLCVPoint[] = [];
  for (let i = 0; i < ts.length; i += 1) {
    const o = toFiniteNumber(open[i]);
    const h = toFiniteNumber(high[i]);
    const l = toFiniteNumber(low[i]);
    const c = toFiniteNumber(close[i]);
    const v = toFiniteNumber(volume[i]);
    if (o === null || h === null || l === null || c === null || v === null) continue;
    points.push({ ts: ts[i], open: o, high: h, low: l, close: c, volume: v });
  }

  if (!points.length) {
    return emptyMarketSnapshot(symbol, period, interval, "No OHLCV rows returned.");
  }

  const technicals = computeTechnicals(points);
  const recentBars = Object.fromEntries(
    points.slice(-30).map((p) => [
      new Date(p.ts * 1000).toISOString().slice(0, 10),
      {
        Open: Number(p.open.toFixed(4)),
        High: Number(p.high.toFixed(4)),
        Low: Number(p.low.toFixed(4)),
        Close: Number(p.close.toFixed(4)),
        Volume: Math.round(p.volume),
      },
    ]),
  );

  return {
    symbol,
    period,
    interval,
    points: points.length,
    technicals,
    recentBars,
  };
}
