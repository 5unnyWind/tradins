import { sentimentLabel, sentimentScore, topKeywords } from "@/lib/data/common";
import type { NewsItem, NewsSnapshot } from "@/lib/types";

function toISO(ts: unknown): string | null {
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
}

export async function fetchNewsSnapshot(symbol: string, limit = 12): Promise<NewsSnapshot> {
  const endpoint = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    symbol,
  )}&newsCount=${Math.max(1, limit)}&quotesCount=0`;
  const response = await fetch(endpoint, {
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
