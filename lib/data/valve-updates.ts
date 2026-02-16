import { fetchBuffPriceHistory, type BuffAuthSource, type BuffCurrency, type BuffGame, type BuffSeriesPoint } from "@/lib/buff";
import { fetchWithSourceHealth } from "@/lib/source-health";
import { z } from "zod";

const STEAM_APP_ID = 730;
const STEAM_GAME = "csgo";
const STEAM_NEWS_BASE = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/";
const STEAM_RSS_URL = "https://steamcommunity.com/games/CSGO/rss";
const DEFAULT_LIMIT = 12;
const DEFAULT_MAX_LENGTH = 5000;

const SteamNewsEnvelopeSchema = z.object({
  appnews: z.object({
    appid: z.coerce.number().optional(),
    count: z.coerce.number().optional(),
    newsitems: z
      .array(
        z.object({
          gid: z.union([z.string(), z.number()]),
          title: z.string().optional().default(""),
          url: z.string().optional().default(""),
          is_external_url: z.coerce.boolean().optional().default(false),
          author: z.string().optional().default(""),
          contents: z.string().optional().default(""),
          feedlabel: z.string().optional().default(""),
          feedname: z.string().optional().default(""),
          date: z.coerce.number().optional().default(0),
          tags: z.array(z.string()).optional().default([]),
        }),
      )
      .default([]),
  }),
});

type SteamNewsItem = z.infer<typeof SteamNewsEnvelopeSchema>["appnews"]["newsitems"][number];

type RssItem = {
  id: string;
  title: string;
  link: string | null;
  author: string | null;
  publishedAt: string;
  publishedAtMs: number;
  descriptionText: string;
  sections: string[];
};

export type ValveUpdateCategory = "economy" | "maps" | "gameplay" | "competitive" | "anti-cheat" | "misc";
export type ValveUpdateSeverity = "high" | "medium" | "low";

export interface ValveSourceStatus {
  source: "steam-api" | "steam-rss";
  endpoint: string;
  ok: boolean;
  itemCount: number;
  error: string | null;
}

export interface ValveOfficialUpdate {
  id: string;
  game: BuffGame;
  title: string;
  url: string | null;
  author: string | null;
  publishedAt: string;
  publishedAtMs: number;
  tags: string[];
  categories: ValveUpdateCategory[];
  sections: string[];
  severity: ValveUpdateSeverity;
  summary: string;
  content: string;
  feedLabel: string | null;
  feedName: string | null;
}

export interface ValveUpdatesResult {
  appId: number;
  game: BuffGame;
  fetchedAt: string;
  sourceStatus: ValveSourceStatus[];
  updates: ValveOfficialUpdate[];
  warnings: string[];
}

export interface FetchValveOfficialUpdatesInput {
  limit?: number;
  maxLength?: number;
  includeRss?: boolean;
  language?: string;
  timeoutMs?: number;
}

export interface FetchValveImpactForGoodsInput {
  goodsId: number;
  game?: BuffGame;
  days?: number;
  currency?: BuffCurrency;
  eventLimit?: number;
  requestCookie?: string | null;
  requestCsrfToken?: string | null;
  timeoutMs?: number;
}

export type ValveImpactDirection = "up" | "down" | "flat" | "insufficient";

export interface ValveImpactEvent {
  id: string;
  title: string;
  url: string | null;
  publishedAt: string;
  categories: ValveUpdateCategory[];
  severity: ValveUpdateSeverity;
  tags: string[];
  summary: string;
  baselinePrice: number | null;
  baselineAt: string | null;
  returnsPct: {
    h1: number | null;
    h24: number | null;
    h72: number | null;
  };
  sampledAt: {
    h1: string | null;
    h24: string | null;
    h72: string | null;
  };
  direction: ValveImpactDirection;
  impactScore: number | null;
}

export interface ValveImpactResult {
  game: BuffGame;
  goodsId: number;
  days: number;
  currency: BuffCurrency;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  priceType: string;
  pricePointCount: number;
  sourceStatus: ValveSourceStatus[];
  events: ValveImpactEvent[];
  warnings: string[];
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function toIsoFromUnixSeconds(tsSec: number): string {
  const safe = Number.isFinite(tsSec) ? tsSec : 0;
  return new Date(safe * 1000).toISOString();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n");
}

function normalizeSteamContents(value: string): string {
  const normalized = value
    .replace(/\\\[/g, "\n[")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\/g, " ")
    .replace(/\.(?=[A-Z\[])/g, ". ");
  return normalizeWhitespace(normalized);
}

function extractSections(value: string): string[] {
  const sections = new Set<string>();
  const sectionRegex = /\[\s*([A-Za-z][A-Za-z\s\-]{1,24})\s*\]/g;
  let matched: RegExpExecArray | null = sectionRegex.exec(value);
  while (matched) {
    const name = matched[1]?.trim().toUpperCase();
    if (name) sections.add(name);
    matched = sectionRegex.exec(value);
  }
  return [...sections];
}

function toSummary(value: string, maxLength = 180): string {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(20, maxLength - 1)).trimEnd()}…`;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function parseRssTag(block: string, tag: string): string {
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i");
  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const cdata = block.match(cdataRegex);
  if (cdata?.[1]) return cdata[1].trim();
  const plain = block.match(plainRegex);
  if (plain?.[1]) return plain[1].trim();
  return "";
}

function hashText(text: string): string {
  let hash = 5381;
  for (let idx = 0; idx < text.length; idx += 1) {
    hash = (hash * 33) ^ text.charCodeAt(idx);
  }
  return Math.abs(hash >>> 0).toString(16);
}

function parseSteamRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;

  let matched: RegExpExecArray | null = itemRegex.exec(xml);
  while (matched) {
    const block = matched[1] ?? "";
    const title = decodeXmlEntities(parseRssTag(block, "title"));
    const linkRaw = decodeXmlEntities(parseRssTag(block, "link"));
    const authorRaw = decodeXmlEntities(parseRssTag(block, "author"));
    const guidRaw = decodeXmlEntities(parseRssTag(block, "guid"));
    const pubDateRaw = parseRssTag(block, "pubDate");
    const descriptionRaw = parseRssTag(block, "description");

    const publishedAtMs = Date.parse(pubDateRaw);
    if (!Number.isFinite(publishedAtMs)) {
      matched = itemRegex.exec(xml);
      continue;
    }

    const descriptionDecoded = decodeXmlEntities(descriptionRaw);
    const descriptionText = normalizeWhitespace(stripHtml(descriptionDecoded));
    const sections = extractSections(`${title}\n${descriptionText}`);

    const stableIdSeed = guidRaw || linkRaw || `${title}|${pubDateRaw}`;

    items.push({
      id: `rss-${hashText(stableIdSeed)}`,
      title: normalizeWhitespace(title),
      link: normalizeWhitespace(linkRaw) || null,
      author: normalizeWhitespace(authorRaw) || null,
      publishedAt: new Date(publishedAtMs).toISOString(),
      publishedAtMs,
      descriptionText,
      sections,
    });

    matched = itemRegex.exec(xml);
  }

  return items.sort((left, right) => right.publishedAtMs - left.publishedAtMs);
}

function classifyUpdate(
  title: string,
  content: string,
  tags: string[],
  sections: string[],
): { categories: ValveUpdateCategory[]; severity: ValveUpdateSeverity } {
  const normalizedText = `${title} ${content} ${tags.join(" ")} ${sections.join(" ")}`.toLowerCase();
  const normalizedSections = new Set(sections.map((item) => item.toUpperCase()));
  const categories = new Set<ValveUpdateCategory>();

  if (
    /\b(case|capsule|sticker|souvenir|collection|drop pool|drop|armory|weapon case|market)\b/.test(normalizedText)
  ) {
    categories.add("economy");
  }

  if (
    normalizedSections.has("MAPS") ||
    /\b(map|anubis|mirage|inferno|nuke|dust|overpass|vertigo|ancient|train|community workshop)\b/.test(normalizedText)
  ) {
    categories.add("maps");
  }

  if (
    normalizedSections.has("GAMEPLAY") ||
    /\b(gameplay|damage|grenade|smoke|molotov|movement|jump|peek|recoil|hitbox|spectator)\b/.test(normalizedText)
  ) {
    categories.add("gameplay");
  }

  if (/\b(operation|premier|matchmaking|competitive|major|ranking|elo)\b/.test(normalizedText)) {
    categories.add("competitive");
  }

  if (/\b(anti-cheat|vac|ban wave|ban|cheat|trust factor)\b/.test(normalizedText)) {
    categories.add("anti-cheat");
  }

  if (
    categories.size === 0 ||
    normalizedSections.has("MISC") ||
    normalizedSections.has("SOUND") ||
    /\b(localization|sound|audio|stability|performance|misc|fix)\b/.test(normalizedText)
  ) {
    categories.add("misc");
  }

  let severity: ValveUpdateSeverity = "low";
  if (categories.has("economy") || /\b(operation|case|capsule|drop pool|collection)\b/.test(normalizedText)) {
    severity = "high";
  } else if (categories.has("maps") || categories.has("gameplay") || categories.has("anti-cheat")) {
    severity = "medium";
  }

  return {
    categories: [...categories],
    severity,
  };
}

function mergeRssIntoSteam(steamItems: SteamNewsItem[], rssItems: RssItem[]): ValveOfficialUpdate[] {
  const usedRssIds = new Set<string>();
  const events: ValveOfficialUpdate[] = [];

  for (const item of steamItems) {
    const timestampMs = Number(item.date) * 1000;
    const steamTitle = normalizeWhitespace(String(item.title ?? ""));
    const steamContent = normalizeSteamContents(String(item.contents ?? ""));
    const steamTags = Array.isArray(item.tags)
      ? item.tags.map((tag) => normalizeWhitespace(String(tag))).filter(Boolean)
      : [];

    const relatedRss = rssItems
      .filter((row) => !usedRssIds.has(row.id))
      .map((row) => ({
        row,
        timeDelta: Math.abs(row.publishedAtMs - timestampMs),
      }))
      .filter((row) => row.timeDelta <= 36 * 60 * 60 * 1000)
      .sort((left, right) => left.timeDelta - right.timeDelta)[0]?.row;

    if (relatedRss) {
      usedRssIds.add(relatedRss.id);
    }

    const mergedContent = normalizeWhitespace(
      [steamContent, relatedRss?.descriptionText ?? ""].filter(Boolean).join("\n"),
    );
    const sections = new Set<string>([
      ...extractSections(steamContent),
      ...(relatedRss?.sections ?? []),
    ]);

    const classified = classifyUpdate(steamTitle, mergedContent, steamTags, [...sections]);

    events.push({
      id: String(item.gid),
      game: STEAM_GAME,
      title: steamTitle || "Counter-Strike 2 Update",
      url: normalizeWhitespace(String(relatedRss?.link ?? item.url ?? "")) || null,
      author: normalizeWhitespace(String(relatedRss?.author ?? item.author ?? "")) || null,
      publishedAt: Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : toIsoFromUnixSeconds(0),
      publishedAtMs: Number.isFinite(timestampMs) ? timestampMs : 0,
      tags: steamTags,
      categories: classified.categories,
      sections: [...sections],
      severity: classified.severity,
      summary: toSummary(mergedContent || steamTitle),
      content: mergedContent,
      feedLabel: normalizeWhitespace(String(item.feedlabel ?? "")) || null,
      feedName: normalizeWhitespace(String(item.feedname ?? "")) || null,
    });
  }

  events.sort((left, right) => right.publishedAtMs - left.publishedAtMs);
  return events;
}

function eventScoreWeight(severity: ValveUpdateSeverity): number {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function findBaselinePoint(points: BuffSeriesPoint[], eventTs: number): BuffSeriesPoint | null {
  if (!points.length) return null;
  let candidate: BuffSeriesPoint | null = null;
  for (const point of points) {
    if (point.timestampMs <= eventTs) {
      candidate = point;
      continue;
    }
    break;
  }

  if (candidate) return candidate;

  const first = points[0];
  if (first && first.timestampMs - eventTs <= 24 * 60 * 60 * 1000) {
    return first;
  }
  return null;
}

function findNearestPoint(points: BuffSeriesPoint[], targetTs: number, maxGapMs: number): BuffSeriesPoint | null {
  if (!points.length) return null;
  let candidate: BuffSeriesPoint | null = null;
  let minGap = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const gap = Math.abs(point.timestampMs - targetTs);
    if (gap < minGap) {
      candidate = point;
      minGap = gap;
    }
  }

  if (!candidate || minGap > maxGapMs) return null;
  return candidate;
}

function calcReturnPct(base: number | null, next: number | null): number | null {
  if (base === null || next === null || !Number.isFinite(base) || !Number.isFinite(next) || base <= 0) {
    return null;
  }
  return Number((((next - base) / base) * 100).toFixed(4));
}

function inferDirection(returnsPct: ValveImpactEvent["returnsPct"]): ValveImpactDirection {
  const values = [returnsPct.h24, returnsPct.h72, returnsPct.h1].filter((value): value is number => value !== null);
  if (!values.length) return "insufficient";
  const pivot = values[0] ?? 0;
  if (Math.abs(pivot) < 0.8) return "flat";
  return pivot > 0 ? "up" : "down";
}

function calcImpactScore(
  severity: ValveUpdateSeverity,
  publishedAtMs: number,
  returnsPct: ValveImpactEvent["returnsPct"],
): number | null {
  const candidates = [returnsPct.h1, returnsPct.h24, returnsPct.h72].filter((value): value is number => value !== null);
  if (!candidates.length) return null;

  const move = Math.max(...candidates.map((value) => Math.abs(value)));
  const ageDays = Math.max(0, (Date.now() - publishedAtMs) / (24 * 60 * 60 * 1000));
  const decay = Math.exp(-ageDays / 45);
  const severityWeight = eventScoreWeight(severity);
  const score = severityWeight * (1 + Math.min(move, 30) / 10) * decay;
  return Number(score.toFixed(3));
}

export async function fetchValveOfficialUpdates(input: FetchValveOfficialUpdatesInput = {}): Promise<ValveUpdatesResult> {
  const limit = clampInt(input.limit ?? DEFAULT_LIMIT, 1, 40);
  const maxLength = clampInt(input.maxLength ?? DEFAULT_MAX_LENGTH, 120, 12_000);
  const includeRss = input.includeRss ?? true;
  const language = normalizeWhitespace(input.language ?? "english") || "english";

  const sourceStatus: ValveSourceStatus[] = [];
  const warnings: string[] = [];

  const steamParams = new URLSearchParams({
    appid: String(STEAM_APP_ID),
    count: String(limit),
    maxlength: String(maxLength),
    feeds: "steam_community_announcements",
    l: language,
  });
  const steamEndpoint = `${STEAM_NEWS_BASE}?${steamParams.toString()}`;

  let steamItems: SteamNewsItem[] = [];
  try {
    const response = await fetchWithSourceHealth("steam", steamEndpoint, {
      cache: "no-store",
      headers: {
        "User-Agent": "tradins-next/0.1",
      },
      signal: input.timeoutMs ? AbortSignal.timeout(input.timeoutMs) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const raw = (await response.json()) as unknown;
    const parsed = SteamNewsEnvelopeSchema.parse(raw);
    steamItems = parsed.appnews.newsitems;

    sourceStatus.push({
      source: "steam-api",
      endpoint: steamEndpoint,
      ok: true,
      itemCount: steamItems.length,
      error: null,
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    sourceStatus.push({
      source: "steam-api",
      endpoint: steamEndpoint,
      ok: false,
      itemCount: 0,
      error: message,
    });
    warnings.push(`Steam 官方新闻拉取失败：${message}`);
  }

  let rssItems: RssItem[] = [];
  if (includeRss) {
    try {
      const response = await fetchWithSourceHealth("steam", STEAM_RSS_URL, {
        cache: "no-store",
        headers: {
          "User-Agent": "tradins-next/0.1",
        },
        signal: input.timeoutMs ? AbortSignal.timeout(input.timeoutMs) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xml = await response.text();
      rssItems = parseSteamRssItems(xml).slice(0, Math.max(limit * 2, 20));

      sourceStatus.push({
        source: "steam-rss",
        endpoint: STEAM_RSS_URL,
        ok: true,
        itemCount: rssItems.length,
        error: null,
      });
    } catch (error) {
      const message = safeErrorMessage(error);
      sourceStatus.push({
        source: "steam-rss",
        endpoint: STEAM_RSS_URL,
        ok: false,
        itemCount: 0,
        error: message,
      });
      warnings.push(`Steam RSS 拉取失败：${message}`);
    }
  }

  let updates: ValveOfficialUpdate[] = [];
  if (steamItems.length) {
    updates = mergeRssIntoSteam(steamItems, rssItems).slice(0, limit);
  } else if (rssItems.length) {
    updates = rssItems.slice(0, limit).map((item) => {
      const classified = classifyUpdate(item.title, item.descriptionText, [], item.sections);
      return {
        id: item.id,
        game: STEAM_GAME,
        title: item.title || "Counter-Strike 2 Update",
        url: item.link,
        author: item.author,
        publishedAt: item.publishedAt,
        publishedAtMs: item.publishedAtMs,
        tags: [],
        categories: classified.categories,
        sections: item.sections,
        severity: classified.severity,
        summary: toSummary(item.descriptionText || item.title),
        content: item.descriptionText,
        feedLabel: "Community Announcements",
        feedName: "steamcommunity-rss",
      } satisfies ValveOfficialUpdate;
    });
  }

  if (!updates.length) {
    warnings.push("未拿到 V 社官方更新，请稍后重试或检查网络。");
  }

  return {
    appId: STEAM_APP_ID,
    game: STEAM_GAME,
    fetchedAt: new Date().toISOString(),
    sourceStatus,
    updates,
    warnings,
  };
}

export async function fetchValveImpactForGoods(input: FetchValveImpactForGoodsInput): Promise<ValveImpactResult> {
  const goodsId = input.goodsId;
  const game = input.game ?? "csgo";
  const days = clampInt(input.days ?? 30, 1, 120);
  const currency = input.currency ?? "CNY";
  const eventLimit = clampInt(input.eventLimit ?? DEFAULT_LIMIT, 1, 24);

  const [updatesResult, priceHistory] = await Promise.all([
    fetchValveOfficialUpdates({
      limit: eventLimit,
      includeRss: true,
      timeoutMs: input.timeoutMs,
    }),
    fetchBuffPriceHistory({
      goodsId,
      days,
      game,
      currency,
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
      timeoutMs: input.timeoutMs,
    }),
  ]);

  const points = [...(priceHistory.primarySeries?.points ?? [])].sort((left, right) => left.timestampMs - right.timestampMs);
  const warnings = [...updatesResult.warnings, ...priceHistory.warnings];

  if (!points.length) {
    warnings.push("该商品没有可用价格主序列，无法计算事件影响窗口。");
  }

  const events = updatesResult.updates.slice(0, eventLimit).map((update) => {
    const baseline = findBaselinePoint(points, update.publishedAtMs);

    const p1 = baseline
      ? findNearestPoint(points, update.publishedAtMs + 1 * 60 * 60 * 1000, 8 * 60 * 60 * 1000)
      : null;
    const p24 = baseline
      ? findNearestPoint(points, update.publishedAtMs + 24 * 60 * 60 * 1000, 36 * 60 * 60 * 1000)
      : null;
    const p72 = baseline
      ? findNearestPoint(points, update.publishedAtMs + 72 * 60 * 60 * 1000, 96 * 60 * 60 * 1000)
      : null;

    const returnsPct = {
      h1: calcReturnPct(baseline?.price ?? null, p1?.price ?? null),
      h24: calcReturnPct(baseline?.price ?? null, p24?.price ?? null),
      h72: calcReturnPct(baseline?.price ?? null, p72?.price ?? null),
    };

    const direction = inferDirection(returnsPct);

    return {
      id: update.id,
      title: update.title,
      url: update.url,
      publishedAt: update.publishedAt,
      categories: update.categories,
      severity: update.severity,
      tags: update.tags,
      summary: update.summary,
      baselinePrice: baseline?.price ?? null,
      baselineAt: baseline?.at ?? null,
      returnsPct,
      sampledAt: {
        h1: p1?.at ?? null,
        h24: p24?.at ?? null,
        h72: p72?.at ?? null,
      },
      direction,
      impactScore: calcImpactScore(update.severity, update.publishedAtMs, returnsPct),
    } satisfies ValveImpactEvent;
  });

  return {
    game,
    goodsId,
    days,
    currency,
    fetchedAt: new Date().toISOString(),
    auth: priceHistory.auth,
    priceType: priceHistory.priceType,
    pricePointCount: points.length,
    sourceStatus: updatesResult.sourceStatus,
    events,
    warnings,
  };
}
