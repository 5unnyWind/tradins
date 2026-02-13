export type InstrumentKind = "equity" | "commodity";

export interface InstrumentContext {
  kind: InstrumentKind;
  requestedSymbol: string;
  marketSymbol: string;
  fundamentalsSymbol: string;
  newsSymbol: string;
  socialSymbol: string;
  displayName: string | null;
}

type CommodityPreset = {
  id: "gold" | "silver";
  displayName: string;
  marketSymbol: string;
  fundamentalsSymbol: string;
  newsSymbol: string;
  socialSymbol: string;
  aliasesZh: string[];
  aliasesAscii: string[];
};

const COMMODITY_PRESETS: CommodityPreset[] = [
  {
    id: "gold",
    displayName: "黄金",
    marketSymbol: "GC=F",
    fundamentalsSymbol: "GLD",
    newsSymbol: "GLD",
    socialSymbol: "GLD",
    aliasesZh: ["黄金", "金价", "现货黄金", "国际金价"],
    aliasesAscii: ["GOLD", "XAU", "XAUUSD", "XAUUSD=X", "GC", "GC=F"],
  },
  {
    id: "silver",
    displayName: "白银",
    marketSymbol: "SI=F",
    fundamentalsSymbol: "SLV",
    newsSymbol: "SLV",
    socialSymbol: "SLV",
    aliasesZh: ["白银", "银价", "现货白银", "国际银价"],
    aliasesAscii: ["SILVER", "XAG", "XAGUSD", "XAGUSD=X", "SI", "SI=F"],
  },
];

function normalizeZhKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeAsciiKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9=]/g, "");
}

function resolveCommodityPreset(rawSymbol: string): CommodityPreset | null {
  const zhKey = normalizeZhKey(rawSymbol);
  const asciiKey = normalizeAsciiKey(rawSymbol);

  for (const preset of COMMODITY_PRESETS) {
    const zhMatched = preset.aliasesZh.some((alias) => normalizeZhKey(alias) === zhKey);
    if (zhMatched) return preset;
    const asciiMatched = preset.aliasesAscii.some((alias) => normalizeAsciiKey(alias) === asciiKey);
    if (asciiMatched) return preset;
    if (normalizeAsciiKey(preset.marketSymbol) === asciiKey) return preset;
  }
  return null;
}

export function normalizeTradableSymbol(rawSymbol: string): string {
  const trimmed = rawSymbol.trim();
  if (!trimmed) return "AAPL";
  const preset = resolveCommodityPreset(trimmed);
  if (preset) return preset.marketSymbol;
  return trimmed.toUpperCase();
}

export function resolveInstrumentContext(symbol: string): InstrumentContext {
  const requestedSymbol = symbol.trim().toUpperCase() || "AAPL";
  const preset = resolveCommodityPreset(requestedSymbol);
  if (!preset) {
    return {
      kind: "equity",
      requestedSymbol,
      marketSymbol: requestedSymbol,
      fundamentalsSymbol: requestedSymbol,
      newsSymbol: requestedSymbol,
      socialSymbol: requestedSymbol,
      displayName: null,
    };
  }

  return {
    kind: "commodity",
    requestedSymbol,
    marketSymbol: preset.marketSymbol,
    fundamentalsSymbol: preset.fundamentalsSymbol,
    newsSymbol: preset.newsSymbol,
    socialSymbol: preset.socialSymbol,
    displayName: preset.displayName,
  };
}
