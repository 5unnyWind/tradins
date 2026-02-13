import { resolveAShareSymbol } from "@/lib/data/a-share";
import { sentimentLabel, sentimentScore, topKeywords } from "@/lib/data/common";
import { resolveInstrumentContext } from "@/lib/instruments";
import { fetchWithSourceHealth } from "@/lib/source-health";
import type { NewsItem, NewsSnapshot } from "@/lib/types";

function toISO(ts: unknown): string | null {
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
}

function toISODateTime(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const withZone = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}+08:00`;
  const ms = Date.parse(withZone);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

async function fetchAShareAnnouncementNews(symbol: string, limit: number): Promise<NewsSnapshot | null> {
  const ashare = resolveAShareSymbol(symbol);
  if (!ashare) return null;

  const endpoint =
    `https://np-anotice-stock.eastmoney.com/api/security/ann?` +
    `page_size=${Math.max(1, limit)}` +
    `&page_index=1&ann_type=A&stock_list=${encodeURIComponent(ashare.code)}`;
  const response = await fetchWithSourceHealth("eastmoney", endpoint, {
    headers: {
      "User-Agent": "tradins-next/0.1",
      Referer: "https://data.eastmoney.com/",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const json = await response.json();
  const rows: unknown[] = Array.isArray(json?.data?.list) ? json.data.list : [];
  const items: NewsItem[] = [];
  const scores: number[] = [];
  const corpus: string[] = [];
  let positive = 0;
  let negative = 0;
  let neutral = 0;

  for (const row of rows.slice(0, limit)) {
    const title =
      String(
        (row as { title_ch?: unknown; title?: unknown })?.title_ch ??
          (row as { title?: unknown })?.title ??
          "",
      ).trim() || `${ashare.normalized} 公告`;
    const columns = Array.isArray((row as { columns?: unknown[] })?.columns)
      ? ((row as { columns?: Array<{ column_name?: unknown }> }).columns ?? [])
      : [];
    const summary = columns
      .map((column) => String(column?.column_name ?? "").trim())
      .filter(Boolean)
      .join(" / ");
    const text = `${title} ${summary}`.trim();
    const score = sentimentScore(text);
    const label = sentimentLabel(score);
    if (label === "positive") positive += 1;
    if (label === "negative") negative += 1;
    if (label === "neutral") neutral += 1;
    scores.push(score);
    corpus.push(text);

    const artCode = String((row as { art_code?: unknown })?.art_code ?? "").trim();
    const link = artCode
      ? `https://data.eastmoney.com/notices/detail/${ashare.code}/${encodeURIComponent(artCode)}.html`
      : null;

    items.push({
      title,
      summary,
      publisher: "东方财富公告",
      publishedAt: toISODateTime((row as { notice_date?: unknown; display_time?: unknown })?.notice_date) ??
        toISODateTime((row as { display_time?: unknown })?.display_time),
      link,
      sentiment: { score: Number(score.toFixed(4)), label },
    });
  }

  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return {
    symbol,
    count: items.length,
    distribution: { positive, negative, neutral },
    avgSentiment: Number(avg.toFixed(4)),
    topics: topKeywords(corpus, 10),
    items,
  };
}

export async function fetchNewsSnapshot(symbol: string, limit = 12): Promise<NewsSnapshot> {
  const instrument = resolveInstrumentContext(symbol);
  const sourceSymbol = instrument.newsSymbol;

  const aShareNews = await fetchAShareAnnouncementNews(sourceSymbol, limit);
  if (aShareNews) return aShareNews;

  const endpoint = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    sourceSymbol,
  )}&newsCount=${Math.max(1, limit)}&quotesCount=0`;
  const response = await fetchWithSourceHealth("yahoo", endpoint, {
    headers: { "User-Agent": "tradins-next/0.1" },
    cache: "no-store",
  });
  if (!response.ok) {
    return {
      symbol,
      count: 0,
      distribution: { positive: 0, negative: 0, neutral: 0 },
      avgSentiment: 0,
      topics: [],
      items: [],
      error: `News API error: ${response.status}`,
    };
  }

  const json = await response.json();
  const rows: unknown[] = Array.isArray(json?.news) ? json.news : [];
  const items: NewsItem[] = [];
  const scores: number[] = [];
  const corpus: string[] = [];
  let positive = 0;
  let negative = 0;
  let neutral = 0;

  for (const row of rows.slice(0, limit)) {
    const title = String((row as { title?: unknown })?.title ?? "");
    const summary = String((row as { summary?: unknown })?.summary ?? "");
    const text = `${title} ${summary}`.trim();
    const score = sentimentScore(text);
    const label = sentimentLabel(score);
    if (label === "positive") positive += 1;
    if (label === "negative") negative += 1;
    if (label === "neutral") neutral += 1;
    scores.push(score);
    corpus.push(text);
    items.push({
      title,
      summary,
      publisher: ((row as { publisher?: unknown })?.publisher as string) ?? null,
      publishedAt: toISO((row as { providerPublishTime?: unknown })?.providerPublishTime),
      link: ((row as { link?: unknown })?.link as string) ?? null,
      sentiment: { score: Number(score.toFixed(4)), label },
    });
  }

  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return {
    symbol,
    count: items.length,
    distribution: { positive, negative, neutral },
    avgSentiment: Number(avg.toFixed(4)),
    topics: topKeywords(corpus, 10),
    items,
  };
}
