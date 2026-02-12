import { sentimentLabel, sentimentScore, topKeywords } from "@/lib/data/common";
import type { SocialItem, SocialSnapshot } from "@/lib/types";

const HEADERS: Record<string, string> = {
  "User-Agent": "tradins-next/0.1",
};

function normalizeSymbol(symbol: string): string {
  return symbol.split(".")[0].replace(/[^A-Za-z]/g, "").toUpperCase();
}

function toISO(ts: unknown): string | null {
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
}

async function fetchReddit(symbol: string, limit: number): Promise<SocialItem[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(symbol)}&sort=new&t=day&limit=${limit}`;
  const resp = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!resp.ok) throw new Error(`Reddit API ${resp.status}`);
  const json = await resp.json();
  const children: unknown[] = json?.data?.children ?? [];
  return children.map((item) => {
    const data = (item as { data?: Record<string, unknown> })?.data ?? {};
    const title = String(data.title ?? "");
    const text = `${title} ${String(data.selftext ?? "")}`.trim();
    const score = sentimentScore(text);
    return {
      source: "reddit",
      title,
      text,
      score: Number(data.score ?? 0),
      comments: Number(data.num_comments ?? 0),
      createdAt: toISO(data.created_utc),
      link: data.permalink ? `https://reddit.com${String(data.permalink)}` : null,
      sentiment: { score: Number(score.toFixed(4)), label: sentimentLabel(score) },
    } satisfies SocialItem;
  });
}

async function fetchStocktwits(symbol: string, limit: number): Promise<SocialItem[]> {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return [];
  const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(normalized)}.json`;
  const resp = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!resp.ok) throw new Error(`Stocktwits API ${resp.status}`);
  const json = await resp.json();
  const messages: unknown[] = json?.messages ?? [];
  return messages.slice(0, limit).map((msg) => {
    const row = msg as Record<string, unknown>;
    const body = String(row.body ?? "");
    const score = sentimentScore(body);
    return {
      source: "stocktwits",
      title: "",
      text: body,
      score: Number((row.likes as Record<string, unknown> | undefined)?.total ?? 0),
      comments: Number((row.conversation as Record<string, unknown> | undefined)?.total ?? 0),
      createdAt: String(row.created_at ?? ""),
      link: row.permalink ? String(row.permalink) : null,
      sentiment: { score: Number(score.toFixed(4)), label: sentimentLabel(score) },
    } satisfies SocialItem;
  });
}

export async function fetchSocialSnapshot(symbol: string, limit = 30): Promise<SocialSnapshot> {
  const half = Math.max(5, Math.floor(limit / 2));
  const errors: string[] = [];

  const [redditRes, stocktwitsRes] = await Promise.allSettled([
    fetchReddit(symbol, half),
    fetchStocktwits(symbol, half),
  ]);

  const items: SocialItem[] = [];
  if (redditRes.status === "fulfilled") items.push(...redditRes.value);
  else errors.push(`reddit: ${redditRes.reason instanceof Error ? redditRes.reason.message : String(redditRes.reason)}`);

  if (stocktwitsRes.status === "fulfilled") items.push(...stocktwitsRes.value);
  else errors.push(`stocktwits: ${stocktwitsRes.reason instanceof Error ? stocktwitsRes.reason.message : String(stocktwitsRes.reason)}`);

  const picked = items.slice(0, limit);
  const corpus = picked.map((x) => `${x.title} ${x.text}`.trim());
  const dist = { positive: 0, negative: 0, neutral: 0 };
  let scoreSum = 0;
  let engagement = 0;
  for (const row of picked) {
    dist[row.sentiment.label] += 1;
    scoreSum += row.sentiment.score;
    engagement += row.score + row.comments;
  }

  return {
    symbol,
    count: picked.length,
    engagement,
    distribution: dist,
    avgSentiment: picked.length ? Number((scoreSum / picked.length).toFixed(4)) : 0,
    topics: topKeywords(corpus, 10),
    items: picked,
    errors,
  };
}
