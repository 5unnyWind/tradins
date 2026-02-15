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

export class DataProviderManager {
  private readonly options: Required<DataProviderManagerOptions>;

  constructor(options: DataProviderManagerOptions = {}) {
    const profile = parseProfile(process.env.TRADINS_DATA_SOURCE_PROFILE);
    const defaults = profileDefaults(profile);
    this.options = {
      marketProviders: dedupe(options.marketProviders ?? defaults.marketProviders),
      fundamentalsProviders: dedupe(options.fundamentalsProviders ?? defaults.fundamentalsProviders),
      newsProviders: dedupe(options.newsProviders ?? defaults.newsProviders),
      socialProviders: dedupe(options.socialProviders ?? defaults.socialProviders),
    };
  }

  async fetchMarket(symbol: string, period = "6mo", interval = "1d") {
    return fetchMarketSnapshotWithProviders(symbol, period, interval, this.options.marketProviders);
  }

  async fetchFundamentals(symbol: string) {
    return fetchFundamentalSnapshotWithProviders(symbol, this.options.fundamentalsProviders);
  }

  async fetchNews(symbol: string, limit = 12) {
    return fetchNewsSnapshotWithProviders(symbol, limit, this.options.newsProviders);
  }

  async fetchSocial(symbol: string, limit = 30) {
    return fetchSocialSnapshotWithProviders(symbol, limit, this.options.socialProviders);
  }

  getResolvedProviders(): Required<DataProviderManagerOptions> {
    return this.options;
  }
}
