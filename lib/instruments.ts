export type InstrumentKind = "equity" | "commodity" | "crypto";

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

type CryptoPreset = {
  id:
    | "btc"
    | "eth"
    | "bnb"
    | "sol"
    | "xrp"
    | "doge"
    | "ada"
    | "trx"
    | "link"
    | "ltc"
    | "avax"
    | "dot";
  displayName: string;
  baseTicker: string;
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

const CRYPTO_PRESETS: CryptoPreset[] = [
  {
    id: "btc",
    displayName: "比特币",
    baseTicker: "BTC",
    marketSymbol: "BTC-USD",
    fundamentalsSymbol: "BTC-USD",
    newsSymbol: "BTC-USD",
    socialSymbol: "BTC",
    aliasesZh: ["比特币", "大饼", "btc", "xbt"],
    aliasesAscii: ["BTC", "XBT", "BTCUSD", "BTCUSDT", "BTCUSDC", "BTCBUSD", "BTC-USD", "BTC-USDT"],
  },
  {
    id: "eth",
    displayName: "以太坊",
    baseTicker: "ETH",
    marketSymbol: "ETH-USD",
    fundamentalsSymbol: "ETH-USD",
    newsSymbol: "ETH-USD",
    socialSymbol: "ETH",
    aliasesZh: ["以太坊", "以太", "eth"],
    aliasesAscii: ["ETH", "ETHUSD", "ETHUSDT", "ETHUSDC", "ETHBUSD", "ETH-USD", "ETH-USDT"],
  },
  {
    id: "bnb",
    displayName: "币安币",
    baseTicker: "BNB",
    marketSymbol: "BNB-USD",
    fundamentalsSymbol: "BNB-USD",
    newsSymbol: "BNB-USD",
    socialSymbol: "BNB",
    aliasesZh: ["币安币", "bnb"],
    aliasesAscii: ["BNB", "BNBUSD", "BNBUSDT", "BNBUSDC", "BNB-USD", "BNB-USDT"],
  },
  {
    id: "sol",
    displayName: "Solana",
    baseTicker: "SOL",
    marketSymbol: "SOL-USD",
    fundamentalsSymbol: "SOL-USD",
    newsSymbol: "SOL-USD",
    socialSymbol: "SOL",
    aliasesZh: ["sol", "solana"],
    aliasesAscii: ["SOL", "SOLUSD", "SOLUSDT", "SOLUSDC", "SOL-USD", "SOL-USDT"],
  },
  {
    id: "xrp",
    displayName: "瑞波币",
    baseTicker: "XRP",
    marketSymbol: "XRP-USD",
    fundamentalsSymbol: "XRP-USD",
    newsSymbol: "XRP-USD",
    socialSymbol: "XRP",
    aliasesZh: ["瑞波币", "xrp"],
    aliasesAscii: ["XRP", "XRPUSD", "XRPUSDT", "XRPUSDC", "XRP-USD", "XRP-USDT"],
  },
  {
    id: "doge",
    displayName: "狗狗币",
    baseTicker: "DOGE",
    marketSymbol: "DOGE-USD",
    fundamentalsSymbol: "DOGE-USD",
    newsSymbol: "DOGE-USD",
    socialSymbol: "DOGE",
    aliasesZh: ["狗狗币", "doge"],
    aliasesAscii: ["DOGE", "DOGEUSD", "DOGEUSDT", "DOGEUSDC", "DOGE-USD", "DOGE-USDT"],
  },
  {
    id: "ada",
    displayName: "艾达币",
    baseTicker: "ADA",
    marketSymbol: "ADA-USD",
    fundamentalsSymbol: "ADA-USD",
    newsSymbol: "ADA-USD",
    socialSymbol: "ADA",
    aliasesZh: ["艾达币", "ada"],
    aliasesAscii: ["ADA", "ADAUSD", "ADAUSDT", "ADAUSDC", "ADA-USD", "ADA-USDT"],
  },
  {
    id: "trx",
    displayName: "波场",
    baseTicker: "TRX",
    marketSymbol: "TRX-USD",
    fundamentalsSymbol: "TRX-USD",
    newsSymbol: "TRX-USD",
    socialSymbol: "TRX",
    aliasesZh: ["波场", "trx"],
    aliasesAscii: ["TRX", "TRXUSD", "TRXUSDT", "TRXUSDC", "TRX-USD", "TRX-USDT"],
  },
  {
    id: "link",
    displayName: "Chainlink",
    baseTicker: "LINK",
    marketSymbol: "LINK-USD",
    fundamentalsSymbol: "LINK-USD",
    newsSymbol: "LINK-USD",
    socialSymbol: "LINK",
    aliasesZh: ["link", "chainlink"],
    aliasesAscii: ["LINK", "LINKUSD", "LINKUSDT", "LINKUSDC", "LINK-USD", "LINK-USDT"],
  },
  {
    id: "ltc",
    displayName: "莱特币",
    baseTicker: "LTC",
    marketSymbol: "LTC-USD",
    fundamentalsSymbol: "LTC-USD",
    newsSymbol: "LTC-USD",
    socialSymbol: "LTC",
    aliasesZh: ["莱特币", "ltc"],
    aliasesAscii: ["LTC", "LTCUSD", "LTCUSDT", "LTCUSDC", "LTC-USD", "LTC-USDT"],
  },
  {
    id: "avax",
    displayName: "Avalanche",
    baseTicker: "AVAX",
    marketSymbol: "AVAX-USD",
    fundamentalsSymbol: "AVAX-USD",
    newsSymbol: "AVAX-USD",
    socialSymbol: "AVAX",
    aliasesZh: ["avax", "avalanche", "雪崩"],
    aliasesAscii: ["AVAX", "AVAXUSD", "AVAXUSDT", "AVAXUSDC", "AVAX-USD", "AVAX-USDT"],
  },
  {
    id: "dot",
    displayName: "Polkadot",
    baseTicker: "DOT",
    marketSymbol: "DOT-USD",
    fundamentalsSymbol: "DOT-USD",
    newsSymbol: "DOT-USD",
    socialSymbol: "DOT",
    aliasesZh: ["dot", "polkadot"],
    aliasesAscii: ["DOT", "DOTUSD", "DOTUSDT", "DOTUSDC", "DOT-USD", "DOT-USDT"],
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

function resolveCryptoPairPreset(asciiKey: string): CryptoPreset | null {
  const pair = asciiKey.match(/^([A-Z0-9]{2,8})(USD|USDT|USDC|BUSD)$/);
  if (!pair?.[1]) return null;
  const base = pair[1];
  return CRYPTO_PRESETS.find((preset) => preset.baseTicker === base) ?? null;
}

function resolveCryptoPreset(rawSymbol: string): CryptoPreset | null {
  const zhKey = normalizeZhKey(rawSymbol);
  const asciiKey = normalizeAsciiKey(rawSymbol);

  for (const preset of CRYPTO_PRESETS) {
    const zhMatched = preset.aliasesZh.some((alias) => normalizeZhKey(alias) === zhKey);
    if (zhMatched) return preset;

    const asciiMatched = preset.aliasesAscii.some((alias) => normalizeAsciiKey(alias) === asciiKey);
    if (asciiMatched) return preset;

    if (normalizeAsciiKey(preset.marketSymbol) === asciiKey) return preset;
  }
  return resolveCryptoPairPreset(asciiKey);
}

export function normalizeTradableSymbol(rawSymbol: string): string {
  const trimmed = rawSymbol.trim();
  if (!trimmed) return "AAPL";
  const preset = resolveCommodityPreset(trimmed);
  if (preset) return preset.marketSymbol;
  const cryptoPreset = resolveCryptoPreset(trimmed);
  if (cryptoPreset) return cryptoPreset.marketSymbol;
  return trimmed.toUpperCase();
}

export function resolveInstrumentContext(symbol: string): InstrumentContext {
  const requestedSymbol = symbol.trim().toUpperCase() || "AAPL";
  const preset = resolveCommodityPreset(requestedSymbol);
  if (preset) {
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

  const cryptoPreset = resolveCryptoPreset(requestedSymbol);
  if (cryptoPreset) {
    return {
      kind: "crypto",
      requestedSymbol,
      marketSymbol: cryptoPreset.marketSymbol,
      fundamentalsSymbol: cryptoPreset.fundamentalsSymbol,
      newsSymbol: cryptoPreset.newsSymbol,
      socialSymbol: cryptoPreset.socialSymbol,
      displayName: cryptoPreset.displayName,
    };
  }

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
