import { sentimentLabel, sentimentScore, topKeywords } from "@/lib/data/common";
import { resolveAShareSymbol } from "@/lib/data/a-share";
import { resolveInstrumentContext } from "@/lib/instruments";
import type { SocialItem, SocialSnapshot } from "@/lib/types";

const HEADERS: Record<string, string> = {
  "User-Agent": "tradins-next/0.1",
};
const EASTMONEY_HEADERS: Record<string, string> = {
  ...HEADERS,
  Referer: "https://guba.eastmoney.com/",
};
const MAX_GUBA_TEXT_LENGTH = 1200;

function normalizeSymbol(symbol: string): string {
  return symbol.split(".")[0].replace(/[^A-Za-z]/g, "").toUpperCase();
}

function toISO(ts: unknown): string | null {
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
}

function toISOFromChinaDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(" ", "T");
  if (!normalized) return null;
  const parsed = Date.parse(`${normalized}+08:00`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clipText(value: unknown, maxLength = MAX_GUBA_TEXT_LENGTH): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : String(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

async function fetchReddit(symbol: string, limit: number): Promise<SocialItem[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(symbol)}&sort=new&t=day&limit=${limit}`;
  const resp = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!resp.ok) {
    if (resp.status === 403 || resp.status === 429) return [];
    throw new Error(`Reddit API ${resp.status}`);
  }
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

async function fetchAshareGuba(symbol: string, limit: number): Promise<SocialItem[]> {
  const ashare = resolveAShareSymbol(symbol);
  if (!ashare) return [];

  const url = `https://guba.eastmoney.com/list,${encodeURIComponent(ashare.code)}.html`;
  const resp = await fetch(url, { headers: EASTMONEY_HEADERS, cache: "no-store" });
  if (!resp.ok) throw new Error(`Eastmoney Guba ${resp.status}`);
  const html = await resp.text();

  const match = html.match(/var article_list\s*=\s*(\{[\s\S]*?\})\s*;\s*var other_list/);
  if (!match?.[1]) throw new Error("Eastmoney Guba payload missing");

  let payload: unknown = null;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    throw new Error("Eastmoney Guba payload parse failed");
  }

  const rows = ((payload as { re?: unknown[] } | null)?.re ?? []).slice(0, Math.max(limit * 3, 40));
  const targetCode = ashare.code;
  const items: SocialItem[] = [];

  for (const row of rows) {
    const post = row as Record<string, unknown>;
    const barCode = String(post.stockbar_code ?? "");
    const externalCode = String(post.stockbar_external_code ?? "");
    if (barCode !== targetCode && externalCode !== targetCode) continue;

    const title = clipText(post.post_title, 180);
    const content = clipText(post.post_content);
    const text = `${title} ${content}`.trim();
    if (!text) continue;

    const score = sentimentScore(text);
    const postId = String(post.post_id ?? "").trim();
    const link =
      postId && barCode
        ? `https://guba.eastmoney.com/news,${encodeURIComponent(barCode)},${encodeURIComponent(postId)}.html`
        : null;

    items.push({
      source: "eastmoney-guba",
      title,
      text,
      score: toNumber(post.post_click_count),
      comments: toNumber(post.post_comment_count),
      createdAt: toISOFromChinaDateTime(post.post_last_time) ?? toISOFromChinaDateTime(post.post_publish_time),
      link,
      sentiment: { score: Number(score.toFixed(4)), label: sentimentLabel(score) },
    });
  }

  return items.slice(0, limit);
}

function sortAndPick(items: SocialItem[], limit: number): SocialItem[] {
  return [...items]
    .sort((left, right) => {
      const leftTs = left.createdAt ? Date.parse(left.createdAt) : Number.NaN;
      const rightTs = right.createdAt ? Date.parse(right.createdAt) : Number.NaN;
      const leftValid = Number.isFinite(leftTs);
      const rightValid = Number.isFinite(rightTs);
      if (leftValid && rightValid && rightTs !== leftTs) return rightTs - leftTs;
      if (leftValid !== rightValid) return rightValid ? 1 : -1;
      return right.score + right.comments - (left.score + left.comments);
    })
    .slice(0, limit);
}

export async function fetchSocialSnapshot(symbol: string, limit = 30): Promise<SocialSnapshot> {
  const instrument = resolveInstrumentContext(symbol);
  const sourceSymbol = instrument.socialSymbol;
  const half = Math.max(5, Math.floor(limit / 2));
  const errors: string[] = [];
  const ashare = resolveAShareSymbol(sourceSymbol);
  const tasks = ashare
    ? [{ source: "eastmoney-guba" as const, task: fetchAshareGuba(sourceSymbol, limit) }]
    : [
        { source: "reddit" as const, task: fetchReddit(sourceSymbol, half) },
        { source: "stocktwits" as const, task: fetchStocktwits(sourceSymbol, half) },
      ];

  const settled = await Promise.allSettled(tasks.map((item) => item.task));

  const items: SocialItem[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value);
      return;
    }
    const name = tasks[index]?.source ?? "unknown";
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    errors.push(`${name}: ${reason}`);
  });

  const picked = sortAndPick(items, limit);
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
