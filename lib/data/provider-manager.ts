import { fetchFundamentalSnapshotWithProviders, type FundamentalsDataProvider } from "@/lib/data/fundamentals";
import { fetchMarketSnapshotWithProviders, type MarketDataProvider } from "@/lib/data/market";
import { fetchNewsSnapshotWithProviders, type NewsDataProvider } from "@/lib/data/news";
import { fetchSocialSnapshotWithProviders, type SocialDataProvider } from "@/lib/data/social";

export interface DataProviderManagerOptions {
  marketProviders?: MarketDataProvider[];
  fundamentalsProviders?: FundamentalsDataProvider[];
  newsProviders?: NewsDataProvider[];
  socialProviders?: SocialDataProvider[];
}

export type DataSourceProfile = "balanced" | "china-first" | "global-first";

function dedupe<T extends string>(items: T[]): T[] {
  return [...new Set(items)];
}

function profileDefaults(profile: DataSourceProfile): Required<DataProviderManagerOptions> {
  if (profile === "china-first") {
    return {
      marketProviders: ["eastmoney", "yahoo"],
      fundamentalsProviders: ["eastmoney", "yahoo"],
      newsProviders: ["eastmoney", "yahoo"],
      socialProviders: ["eastmoney-guba", "reddit", "stocktwits"],
    };
  }

  if (profile === "global-first") {
    return {
      marketProviders: ["yahoo", "eastmoney"],
      fundamentalsProviders: ["yahoo", "eastmoney"],
      newsProviders: ["yahoo", "eastmoney"],
      socialProviders: ["reddit", "stocktwits", "eastmoney-guba"],
    };
  }

  return {
    marketProviders: ["eastmoney", "yahoo"],
    fundamentalsProviders: ["eastmoney", "yahoo"],
    newsProviders: ["eastmoney", "yahoo"],
    socialProviders: ["eastmoney-guba", "reddit", "stocktwits"],
  };
}

function parseProfile(raw: string | undefined): DataSourceProfile {
  const normalized = (raw ?? "balanced").trim().toLowerCase();
  if (normalized === "china-first") return "china-first";
  if (normalized === "global-first") return "global-first";
  return "balanced";
}

type ProviderField = keyof Required<DataProviderManagerOptions>;

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function isAShareSymbol(symbol: string): boolean {
  const s = normalizeSymbol(symbol);
  if (/^(SH|SZ)\d{6}$/.test(s)) return true;
  if (/^\d{6}\.(SH|SZ)$/.test(s)) return true;
  return /^\d{6}$/.test(s);
}

function isHKSymbol(symbol: string): boolean {
  const s = normalizeSymbol(symbol);
  if (/^\d{4,5}\.HK$/.test(s)) return true;
  return /^0?\d{4,5}$/.test(s);
}

function isChinaPreferredSymbol(symbol: string): boolean {
  return isAShareSymbol(symbol) || isHKSymbol(symbol);
}

export class DataProviderManager {
  private readonly options: Required<DataProviderManagerOptions>;
  private readonly chinaFirstOptions: Required<DataProviderManagerOptions>;
  private readonly explicitOverrides: Record<ProviderField, boolean>;

  constructor(options: DataProviderManagerOptions = {}) {
    const profile = parseProfile(process.env.TRADINS_DATA_SOURCE_PROFILE);
    const defaults = profileDefaults(profile);
    this.chinaFirstOptions = profileDefaults("china-first");
    this.options = {
      marketProviders: dedupe(options.marketProviders ?? defaults.marketProviders),
      fundamentalsProviders: dedupe(options.fundamentalsProviders ?? defaults.fundamentalsProviders),
      newsProviders: dedupe(options.newsProviders ?? defaults.newsProviders),
      socialProviders: dedupe(options.socialProviders ?? defaults.socialProviders),
    };
    this.explicitOverrides = {
      marketProviders: options.marketProviders !== undefined,
      fundamentalsProviders: options.fundamentalsProviders !== undefined,
      newsProviders: options.newsProviders !== undefined,
      socialProviders: options.socialProviders !== undefined,
    };
  }

  private marketProvidersFor(symbol: string): MarketDataProvider[] {
    if (this.explicitOverrides.marketProviders) return this.options.marketProviders;
    if (!isChinaPreferredSymbol(symbol)) return this.options.marketProviders;
    return this.chinaFirstOptions.marketProviders;
  }

  private fundamentalsProvidersFor(symbol: string): FundamentalsDataProvider[] {
    if (this.explicitOverrides.fundamentalsProviders) return this.options.fundamentalsProviders;
    if (!isChinaPreferredSymbol(symbol)) return this.options.fundamentalsProviders;
    return this.chinaFirstOptions.fundamentalsProviders;
  }

  private newsProvidersFor(symbol: string): NewsDataProvider[] {
    if (this.explicitOverrides.newsProviders) return this.options.newsProviders;
    if (!isChinaPreferredSymbol(symbol)) return this.options.newsProviders;
    return this.chinaFirstOptions.newsProviders;
  }

  private socialProvidersFor(symbol: string): SocialDataProvider[] {
    if (this.explicitOverrides.socialProviders) return this.options.socialProviders;
    if (!isChinaPreferredSymbol(symbol)) return this.options.socialProviders;
    return this.chinaFirstOptions.socialProviders;
  }

  async fetchMarket(symbol: string, period = "6mo", interval = "1d") {
    return fetchMarketSnapshotWithProviders(symbol, period, interval, this.marketProvidersFor(symbol));
  }

  async fetchFundamentals(symbol: string) {
    return fetchFundamentalSnapshotWithProviders(symbol, this.fundamentalsProvidersFor(symbol));
  }

  async fetchNews(symbol: string, limit = 12) {
    return fetchNewsSnapshotWithProviders(symbol, limit, this.newsProvidersFor(symbol));
  }

  async fetchSocial(symbol: string, limit = 30) {
    return fetchSocialSnapshotWithProviders(symbol, limit, this.socialProvidersFor(symbol));
  }

  getResolvedProviders(): Required<DataProviderManagerOptions> {
    return this.options;
  }
}
