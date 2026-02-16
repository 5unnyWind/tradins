import {
  fetchBuffGoodsInfo,
  fetchBuffPriceHistory,
  type BuffAuthSource,
  type BuffCurrency,
  type BuffGame,
  type BuffSeriesPoint,
} from "@/lib/buff";
import { fetchWithSourceHealth } from "@/lib/source-health";
import { z } from "zod";

const HLTV_RSS_URL = "https://www.hltv.org/rss/news";
const LIQUIPEDIA_API_BASE = "https://liquipedia.net/counterstrike/api.php";
const DEFAULT_LIMIT = 16;
const MAX_LIMIT = 40;
const MAX_PLAYER_LOOKUP = 12;

const LIQUIPEDIA_USER_AGENT =
  process.env.LIQUIPEDIA_USER_AGENT?.trim() ||
  "tradins-bot/0.1 (+https://github.com/tradins; contact: admin@example.com)";

type HltvRssItem = {
  id: string;
  title: string;
  description: string;
  url: string | null;
  publishedAt: string;
  publishedAtMs: number;
};

export type ProEventType = "retirement" | "roster_move" | "preference" | "other";
export type ProEventSeverity = "high" | "medium" | "low";
export type ProPlayerStatus = "active" | "retired" | "unknown";

export interface ProSourceStatus {
  source: "hltv-rss" | "liquipedia-api";
  endpoint: string;
  ok: boolean;
  itemCount: number;
  error: string | null;
}

export interface ProEventPlayer {
  name: string;
  status: ProPlayerStatus;
  pageTitle: string | null;
}

export interface ProPlayerEvent {
  id: string;
  game: BuffGame;
  source: "hltv";
  title: string;
  summary: string;
  url: string | null;
  publishedAt: string;
  publishedAtMs: number;
  eventType: ProEventType;
  severity: ProEventSeverity;
  players: ProEventPlayer[];
  keywords: string[];
}

export interface ProPlayerEventsResult {
  game: BuffGame;
  fetchedAt: string;
  sourceStatus: ProSourceStatus[];
  events: ProPlayerEvent[];
  warnings: string[];
}

export interface FetchProPlayerEventsInput {
  limit?: number;
  includeLiquipedia?: boolean;
  timeoutMs?: number;
}

export type ProImpactDirection = "up" | "down" | "flat" | "insufficient";

export interface ProImpactEvent {
  id: string;
  title: string;
  url: string | null;
  publishedAt: string;
  eventType: ProEventType;
  severity: ProEventSeverity;
  players: ProEventPlayer[];
  keywords: string[];
  summary: string;
  relevanceScore: number;
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
  direction: ProImpactDirection;
  impactScore: number | null;
}

export interface ProImpactResult {
  game: BuffGame;
  goodsId: number;
  goodsName: string | null;
  days: number;
  currency: BuffCurrency;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  priceType: string;
  pricePointCount: number;
  sourceStatus: ProSourceStatus[];
  events: ProImpactEvent[];
  warnings: string[];
}

export interface FetchProImpactForGoodsInput {
  goodsId: number;
  game?: BuffGame;
  days?: number;
  currency?: BuffCurrency;
  eventLimit?: number;
  requestCookie?: string | null;
  requestCsrfToken?: string | null;
  timeoutMs?: number;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
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

function toSummary(value: string, maxLength = 200): string {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(20, maxLength - 1)).trimEnd()}…`;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function parseHltvNewsRss(xml: string): HltvRssItem[] {
  const items: HltvRssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;

  let matched: RegExpExecArray | null = itemRegex.exec(xml);
  while (matched) {
    const block = matched[1] ?? "";
    const titleRaw = parseRssTag(block, "title");
    const descriptionRaw = parseRssTag(block, "description");
    const linkRaw = parseRssTag(block, "link");
    const guidRaw = parseRssTag(block, "guid");
    const pubDateRaw = parseRssTag(block, "pubDate");

    const publishedAtMs = Date.parse(pubDateRaw);
    if (!Number.isFinite(publishedAtMs)) {
      matched = itemRegex.exec(xml);
      continue;
    }

    const title = normalizeWhitespace(decodeXmlEntities(titleRaw));
    const description = normalizeWhitespace(stripHtml(decodeXmlEntities(descriptionRaw)));
    const url = normalizeWhitespace(decodeXmlEntities(linkRaw)) || null;

    const stableIdSeed = decodeXmlEntities(guidRaw) || url || `${title}|${pubDateRaw}`;

    items.push({
      id: `hltv-${hashText(stableIdSeed)}`,
      title,
      description,
      url,
      publishedAt: new Date(publishedAtMs).toISOString(),
      publishedAtMs,
    });

    matched = itemRegex.exec(xml);
  }

  return items.sort((left, right) => right.publishedAtMs - left.publishedAtMs);
}

function extractPlayers(text: string): string[] {
  const players = new Set<string>();

  const quoteRegex = /["“”'`]{1}([^"“”'`]{2,24})["“”'`]{1}/g;
  let quoteMatch: RegExpExecArray | null = quoteRegex.exec(text);
  while (quoteMatch) {
    const name = normalizeWhitespace(quoteMatch[1] ?? "");
    if (name && !/\s{2,}/.test(name)) {
      players.add(name);
    }
    quoteMatch = quoteRegex.exec(text);
  }

  const prefixMatch = text.match(/^([A-Za-z0-9_\-]{2,16}):/);
  if (prefixMatch?.[1]) {
    players.add(prefixMatch[1]);
  }

  const onRegex = /\bon\s+([A-Za-z0-9_\-]{2,16})\b/gi;
  let onMatch: RegExpExecArray | null = onRegex.exec(text);
  while (onMatch) {
    const candidate = normalizeWhitespace(onMatch[1] ?? "");
    if (candidate && !/^the$/i.test(candidate)) {
      players.add(candidate);
    }
    onMatch = onRegex.exec(text);
  }

  return [...players].slice(0, 4);
}

function classifyProEvent(title: string, description: string): { eventType: ProEventType; severity: ProEventSeverity } {
  const text = `${title} ${description}`.toLowerCase();

  const retirementPattern = /\b(retire|retired|retires|retirement|steps down|stepped down|hangs up|inactive)\b/;
  if (retirementPattern.test(text)) {
    return { eventType: "retirement", severity: "high" };
  }

  const rosterPattern = /\b(join|joins|joined|sign|signed|transfer|loan|benched|bench|stand-in|stand in|parts ways|released|replaces|returns to)\b/;
  if (rosterPattern.test(text)) {
    return { eventType: "roster_move", severity: "medium" };
  }

  const preferencePattern = /\b(settings|crosshair|loadout|skin|sticker|awp|ak-47|m4a1-s|m4a4|deagle|usp-s|knife|glove)\b/;
  if (preferencePattern.test(text)) {
    return { eventType: "preference", severity: "medium" };
  }

  return { eventType: "other", severity: "low" };
}

const KEYWORDS = [
  "retired",
  "retirement",
  "inactive",
  "benched",
  "bench",
  "transfer",
  "joined",
  "released",
  "awp",
  "ak-47",
  "m4a1-s",
  "m4a4",
  "deagle",
  "usp-s",
  "knife",
  "glove",
  "skin",
  "sticker",
  "loadout",
  "crosshair",
];

function extractKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  return KEYWORDS.filter((keyword) => text.includes(keyword));
}

const LiquipediaSearchSchema = z.object({
  query: z
    .object({
      search: z
        .array(
          z.object({
            title: z.string(),
          }),
        )
        .default([]),
    })
    .optional(),
});

const LiquipediaCategoriesSchema = z.object({
  query: z
    .object({
      pages: z.record(
        z.object({
          title: z.string().optional(),
          categories: z
            .array(
              z.object({
                title: z.string(),
              }),
            )
            .optional()
            .default([]),
        }),
      ),
    })
    .optional(),
});

async function lookupPlayerStatusOnLiquipedia(
  playerName: string,
  timeoutMs?: number,
): Promise<{ name: string; status: ProPlayerStatus; pageTitle: string | null }> {
  const searchParams = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `${playerName} counter-strike`,
    srlimit: "1",
    format: "json",
  });
  const searchEndpoint = `${LIQUIPEDIA_API_BASE}?${searchParams.toString()}`;

  const searchResp = await fetchWithSourceHealth("liquipedia", searchEndpoint, {
    cache: "no-store",
    headers: {
      "User-Agent": LIQUIPEDIA_USER_AGENT,
      "Accept-Encoding": "gzip",
    },
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });

  if (!searchResp.ok) {
    throw new Error(`Liquipedia search HTTP ${searchResp.status}`);
  }

  const searchJson = LiquipediaSearchSchema.parse((await searchResp.json()) as unknown);
  const pageTitle = searchJson.query?.search?.[0]?.title ?? null;
  if (!pageTitle) {
    return { name: playerName, status: "unknown", pageTitle: null };
  }

  const normalizedName = playerName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedTitle = pageTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalizedName.length >= 3 && !normalizedTitle.includes(normalizedName)) {
    return { name: playerName, status: "unknown", pageTitle: null };
  }

  const categoriesParams = new URLSearchParams({
    action: "query",
    titles: pageTitle,
    prop: "categories",
    cllimit: "500",
    format: "json",
  });
  const categoriesEndpoint = `${LIQUIPEDIA_API_BASE}?${categoriesParams.toString()}`;

  const categoriesResp = await fetchWithSourceHealth("liquipedia", categoriesEndpoint, {
    cache: "no-store",
    headers: {
      "User-Agent": LIQUIPEDIA_USER_AGENT,
      "Accept-Encoding": "gzip",
    },
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });

  if (!categoriesResp.ok) {
    throw new Error(`Liquipedia categories HTTP ${categoriesResp.status}`);
  }

  const categoriesJson = LiquipediaCategoriesSchema.parse((await categoriesResp.json()) as unknown);
  const pageRows = Object.values(categoriesJson.query?.pages ?? {});
  const categoryNames = pageRows.flatMap((row) => row.categories?.map((item) => item.title) ?? []);

  if (categoryNames.some((name) => /Category:Retired Players/i.test(name))) {
    return { name: playerName, status: "retired", pageTitle };
  }
  if (categoryNames.some((name) => /Category:Active Players/i.test(name))) {
    return { name: playerName, status: "active", pageTitle };
  }

  return { name: playerName, status: "unknown", pageTitle };
}

function playerStatusMapKey(name: string): string {
  return normalizeWhitespace(name).toLowerCase();
}

function eventSeverityWeight(severity: ProEventSeverity): number {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function detectWeapons(text: string): Set<string> {
  const normalized = text.toLowerCase();
  const set = new Set<string>();

  const weaponPatterns: Array<{ id: string; patterns: RegExp[] }> = [
    { id: "ak-47", patterns: [/\bak-?47\b/] },
    { id: "m4a1-s", patterns: [/\bm4a1-?s\b/] },
    { id: "m4a4", patterns: [/\bm4a4\b/] },
    { id: "awp", patterns: [/\bawp\b/] },
    { id: "deagle", patterns: [/\bdeagle\b/, /\bdesert eagle\b/] },
    { id: "usp-s", patterns: [/\busp-?s\b/] },
    { id: "knife", patterns: [/\bknife\b/] },
    { id: "glove", patterns: [/\bglove\b/] },
  ];

  for (const weapon of weaponPatterns) {
    if (weapon.patterns.some((pattern) => pattern.test(normalized))) {
      set.add(weapon.id);
    }
  }

  return set;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9\-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
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

function inferDirection(returnsPct: ProImpactEvent["returnsPct"]): ProImpactDirection {
  const values = [returnsPct.h24, returnsPct.h72, returnsPct.h1].filter((value): value is number => value !== null);
  if (!values.length) return "insufficient";
  const pivot = values[0] ?? 0;
  if (Math.abs(pivot) < 0.8) return "flat";
  return pivot > 0 ? "up" : "down";
}

function calcRelevanceScore(event: ProPlayerEvent, goodsText: string): number {
  const eventText = `${event.title} ${event.summary} ${event.keywords.join(" ")} ${event.players
    .map((player) => player.name)
    .join(" ")}`;

  const goodsTokens = tokenize(goodsText);
  const eventTokens = tokenize(eventText);

  let overlapCount = 0;
  for (const token of goodsTokens) {
    if (eventTokens.has(token)) overlapCount += 1;
  }

  let score = Math.min(0.45, overlapCount * 0.1);

  const goodsWeapons = detectWeapons(goodsText);
  const eventWeapons = detectWeapons(eventText);
  const hasWeaponIntersection = [...goodsWeapons].some((weapon) => eventWeapons.has(weapon));
  if (hasWeaponIntersection) {
    score += 0.45;
  }

  if (event.eventType === "retirement") score += 0.2;
  if (event.eventType === "roster_move") score += 0.15;
  if (event.eventType === "preference") score += 0.3;

  const retiredPlayers = event.players.filter((player) => player.status === "retired").length;
  if (retiredPlayers > 0) {
    score += Math.min(0.2, retiredPlayers * 0.1);
  }

  return Number(Math.max(0, Math.min(score, 1)).toFixed(4));
}

function calcImpactScore(
  relevanceScore: number,
  severity: ProEventSeverity,
  publishedAtMs: number,
  returnsPct: ProImpactEvent["returnsPct"],
): number | null {
  const candidates = [returnsPct.h1, returnsPct.h24, returnsPct.h72].filter((value): value is number => value !== null);
  if (!candidates.length) return null;

  const move = Math.max(...candidates.map((value) => Math.abs(value)));
  const ageDays = Math.max(0, (Date.now() - publishedAtMs) / (24 * 60 * 60 * 1000));
  const decay = Math.exp(-ageDays / 35);
  const severityWeight = eventSeverityWeight(severity);
  const score = relevanceScore * severityWeight * (1 + Math.min(move, 30) / 10) * decay;
  return Number(score.toFixed(3));
}

export async function fetchProPlayerEvents(input: FetchProPlayerEventsInput = {}): Promise<ProPlayerEventsResult> {
  const limit = clampInt(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const includeLiquipedia = input.includeLiquipedia ?? true;

  const sourceStatus: ProSourceStatus[] = [];
  const warnings: string[] = [];

  let rssItems: HltvRssItem[] = [];

  try {
    const response = await fetchWithSourceHealth("hltv", HLTV_RSS_URL, {
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
    rssItems = parseHltvNewsRss(xml).slice(0, Math.max(limit * 2, 40));

    sourceStatus.push({
      source: "hltv-rss",
      endpoint: HLTV_RSS_URL,
      ok: true,
      itemCount: rssItems.length,
      error: null,
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    sourceStatus.push({
      source: "hltv-rss",
      endpoint: HLTV_RSS_URL,
      ok: false,
      itemCount: 0,
      error: message,
    });
    warnings.push(`HLTV RSS 拉取失败：${message}`);
  }

  const baseEvents: ProPlayerEvent[] = rssItems.slice(0, limit).map((item) => {
    const { eventType, severity } = classifyProEvent(item.title, item.description);
    const players = extractPlayers(`${item.title} ${item.description}`).map((name) => ({
      name,
      status: "unknown" as const,
      pageTitle: null,
    }));

    return {
      id: item.id,
      game: "csgo",
      source: "hltv",
      title: item.title,
      summary: toSummary(item.description || item.title),
      url: item.url,
      publishedAt: item.publishedAt,
      publishedAtMs: item.publishedAtMs,
      eventType,
      severity,
      players,
      keywords: extractKeywords(item.title, item.description),
    } satisfies ProPlayerEvent;
  });

  let enrichedEvents = baseEvents;

  if (includeLiquipedia) {
    const uniquePlayers = [...new Set(baseEvents.flatMap((event) => event.players.map((player) => player.name)))].slice(
      0,
      MAX_PLAYER_LOOKUP,
    );

    if (uniquePlayers.length) {
      try {
        const statuses = await Promise.all(uniquePlayers.map((name) => lookupPlayerStatusOnLiquipedia(name, input.timeoutMs)));
        const statusMap = new Map(statuses.map((item) => [playerStatusMapKey(item.name), item]));

        enrichedEvents = baseEvents.map((event) => ({
          ...event,
          players: event.players.map((player) => {
            const hit = statusMap.get(playerStatusMapKey(player.name));
            return {
              name: player.name,
              status: hit?.status ?? "unknown",
              pageTitle: hit?.pageTitle ?? null,
            } satisfies ProEventPlayer;
          }),
        }));

        sourceStatus.push({
          source: "liquipedia-api",
          endpoint: LIQUIPEDIA_API_BASE,
          ok: true,
          itemCount: statuses.length,
          error: null,
        });
      } catch (error) {
        const message = safeErrorMessage(error);
        sourceStatus.push({
          source: "liquipedia-api",
          endpoint: LIQUIPEDIA_API_BASE,
          ok: false,
          itemCount: 0,
          error: message,
        });
        warnings.push(`Liquipedia 状态补全失败：${message}`);
      }
    } else {
      sourceStatus.push({
        source: "liquipedia-api",
        endpoint: LIQUIPEDIA_API_BASE,
        ok: true,
        itemCount: 0,
        error: null,
      });
    }
  }

  if (!enrichedEvents.length) {
    warnings.push("未获取到职业选手事件，请稍后重试。");
  }

  return {
    game: "csgo",
    fetchedAt: new Date().toISOString(),
    sourceStatus,
    events: enrichedEvents,
    warnings,
  };
}

export async function fetchProImpactForGoods(input: FetchProImpactForGoodsInput): Promise<ProImpactResult> {
  const goodsId = input.goodsId;
  const game = input.game ?? "csgo";
  const days = clampInt(input.days ?? 30, 1, 120);
  const currency = input.currency ?? "CNY";
  const eventLimit = clampInt(input.eventLimit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);

  const [eventsResult, priceHistory, goodsInfoWrap] = await Promise.all([
    fetchProPlayerEvents({
      limit: eventLimit,
      includeLiquipedia: true,
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
    fetchBuffGoodsInfo({
      goodsId,
      game,
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
      timeoutMs: input.timeoutMs,
    }),
  ]);

  const points = [...(priceHistory.primarySeries?.points ?? [])].sort((left, right) => left.timestampMs - right.timestampMs);

  const goodsName =
    goodsInfoWrap.result?.name ??
    goodsInfoWrap.result?.shortName ??
    goodsInfoWrap.result?.marketHashName ??
    null;

  const goodsText = normalizeWhitespace(
    [goodsInfoWrap.result?.name, goodsInfoWrap.result?.shortName, goodsInfoWrap.result?.marketHashName]
      .filter(Boolean)
      .join(" "),
  );

  const warnings = [...eventsResult.warnings, ...priceHistory.warnings];

  if (!points.length) {
    warnings.push("该商品没有可用价格主序列，无法计算职业事件影响窗口。");
  }

  const scored = eventsResult.events.map((event) => {
    const baseline = findBaselinePoint(points, event.publishedAtMs);
    const p1 = baseline
      ? findNearestPoint(points, event.publishedAtMs + 1 * 60 * 60 * 1000, 8 * 60 * 60 * 1000)
      : null;
    const p24 = baseline
      ? findNearestPoint(points, event.publishedAtMs + 24 * 60 * 60 * 1000, 36 * 60 * 60 * 1000)
      : null;
    const p72 = baseline
      ? findNearestPoint(points, event.publishedAtMs + 72 * 60 * 60 * 1000, 96 * 60 * 60 * 1000)
      : null;

    const returnsPct = {
      h1: calcReturnPct(baseline?.price ?? null, p1?.price ?? null),
      h24: calcReturnPct(baseline?.price ?? null, p24?.price ?? null),
      h72: calcReturnPct(baseline?.price ?? null, p72?.price ?? null),
    };

    const relevanceScore = goodsText ? calcRelevanceScore(event, goodsText) : 0;

    return {
      id: event.id,
      title: event.title,
      url: event.url,
      publishedAt: event.publishedAt,
      publishedAtMs: event.publishedAtMs,
      eventType: event.eventType,
      severity: event.severity,
      players: event.players,
      keywords: event.keywords,
      summary: event.summary,
      relevanceScore,
      baselinePrice: baseline?.price ?? null,
      baselineAt: baseline?.at ?? null,
      returnsPct,
      sampledAt: {
        h1: p1?.at ?? null,
        h24: p24?.at ?? null,
        h72: p72?.at ?? null,
      },
      direction: inferDirection(returnsPct),
      impactScore: calcImpactScore(relevanceScore, event.severity, event.publishedAtMs, returnsPct),
    };
  });

  const filtered = scored.filter((event) => event.relevanceScore >= 0.15);
  const selected = (filtered.length ? filtered : scored)
    .sort((left, right) => {
      const leftScore = left.impactScore ?? 0;
      const rightScore = right.impactScore ?? 0;
      if (rightScore !== leftScore) return rightScore - leftScore;
      if (right.relevanceScore !== left.relevanceScore) return right.relevanceScore - left.relevanceScore;
      return right.publishedAtMs - left.publishedAtMs;
    })
    .slice(0, eventLimit)
    .sort((left, right) => right.publishedAtMs - left.publishedAtMs)
    .map((item) => {
      const { publishedAtMs, ...rest } = item;
      return rest;
    });

  return {
    game,
    goodsId,
    goodsName,
    days,
    currency,
    fetchedAt: new Date().toISOString(),
    auth: priceHistory.auth,
    priceType: priceHistory.priceType,
    pricePointCount: points.length,
    sourceStatus: eventsResult.sourceStatus,
    events: selected,
    warnings,
  };
}
