export type AShareExchange = "SH" | "SZ";

export interface AShareSymbol {
  code: string;
  exchange: AShareExchange;
  secid: string;
  emCode: string;
  secuCode: string;
  normalized: string;
}

function inferExchange(code: string): AShareExchange | null {
  const first = code[0];
  if (first === "6" || first === "5" || first === "9") return "SH";
  if (first === "0" || first === "2" || first === "3") return "SZ";
  return null;
}

function parseCodeAndExchange(symbol: string): { code: string; exchange: AShareExchange } | null {
  const raw = symbol.trim().toUpperCase();
  if (!raw) return null;

  const prefixed = raw.match(/^(SH|SZ)(\d{6})$/);
  if (prefixed) {
    return { exchange: prefixed[1] as AShareExchange, code: prefixed[2] };
  }

  const suffixed = raw.match(/^(\d{6})\.(SH|SS|SZ)$/);
  if (suffixed) {
    const exchange = suffixed[2] === "SZ" ? "SZ" : "SH";
    return { exchange, code: suffixed[1] };
  }

  const onlyCode = raw.match(/^(\d{6})$/);
  if (onlyCode) {
    const exchange = inferExchange(onlyCode[1]);
    if (!exchange) return null;
    return { exchange, code: onlyCode[1] };
  }

  return null;
}

export function resolveAShareSymbol(symbol: string): AShareSymbol | null {
  const parsed = parseCodeAndExchange(symbol);
  if (!parsed) return null;
  const marketId = parsed.exchange === "SH" ? "1" : "0";
  return {
    code: parsed.code,
    exchange: parsed.exchange,
    secid: `${marketId}.${parsed.code}`,
    emCode: `${parsed.exchange}${parsed.code}`,
    secuCode: `${parsed.code}.${parsed.exchange}`,
    normalized: `${parsed.code}.${parsed.exchange}`,
  };
}

function toYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function parsePeriodDays(period: string): number | null {
  const normalized = period.trim().toLowerCase();
  if (!normalized) return 365;
  if (normalized === "max") return null;
  if (normalized === "ytd") return -1;
  const hit = normalized.match(/^(\d+)\s*(d|day|days|wk|w|mo|m|y|yr|yrs)$/);
  if (!hit) return 365;
  const value = Number(hit[1]);
  const unit = hit[2];
  if (!Number.isFinite(value) || value <= 0) return 365;
  if (unit === "d" || unit === "day" || unit === "days") return value;
  if (unit === "wk" || unit === "w") return value * 7;
  if (unit === "mo" || unit === "m") return value * 31;
  return value * 366;
}

function mapKlt(interval: string): string {
  const normalized = interval.trim().toLowerCase();
  if (normalized === "1m") return "1";
  if (normalized === "5m") return "5";
  if (normalized === "15m") return "15";
  if (normalized === "30m") return "30";
  if (normalized === "60m" || normalized === "1h") return "60";
  if (normalized === "1wk" || normalized === "1w") return "102";
  if (normalized === "1mo" || normalized === "1mth") return "103";
  return "101";
}

export function eastmoneyKlineParams(period: string, interval: string): {
  klt: string;
  beg: string;
  end: string;
  lmt: number;
} {
  const now = new Date();
  const end = "20500101";
  const klt = mapKlt(interval);
  const days = parsePeriodDays(period);

  let beg: string;
  if (days === null) {
    beg = "19900101";
  } else if (days === -1) {
    beg = `${now.getUTCFullYear()}0101`;
  } else {
    const from = new Date(now.getTime() - days * 24 * 3600 * 1000);
    beg = toYmd(from);
  }

  const intraday = klt === "1" || klt === "5" || klt === "15" || klt === "30" || klt === "60";
  const lmt = intraday ? 2000 : 5000;
  return { klt, beg, end, lmt };
}

