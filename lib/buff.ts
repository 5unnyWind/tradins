import "server-only";

import { z } from "zod";

export type BuffGame = "csgo";
export type BuffCurrency = "CNY" | "USD";
export type BuffAuthSource = "request" | "env" | "none";
export type BuffMarketTab = "selling" | "buying" | "bundle" | "all";

export interface BuffSeriesPoint {
  timestampMs: number;
  at: string;
  price: number;
}

export interface BuffPriceLineSummary {
  key: string;
  name: string;
  chartType: string;
  color: string | null;
  allow: boolean;
  show: boolean;
  pointCount: number;
  points: BuffSeriesPoint[];
  firstAt: string | null;
  latestAt: string | null;
  firstPrice: number | null;
  latestPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  changePct: number | null;
  isGated: boolean;
  gateMessage: string | null;
}

export interface BuffPriceHistoryResult {
  game: BuffGame;
  goodsId: number;
  days: number;
  currency: BuffCurrency;
  currencyLabel: string;
  currencySymbol: string;
  priceType: string;
  endpoint: string;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  lines: BuffPriceLineSummary[];
  primaryLineKey: string | null;
  primarySeries: {
    key: string;
    name: string;
    points: BuffSeriesPoint[];
  } | null;
  warnings: string[];
}

export interface BuffHistoryDayOption {
  days: number;
  text: string;
  disabled: boolean;
  gateMessage: string | null;
}

export interface BuffHistoryDaysResult {
  source: "buff" | "steam";
  game: BuffGame;
  goodsId: number;
  endpoint: string;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  options: BuffHistoryDayOption[];
}

export interface BuffMarketListItem {
  goodsId: number;
  name: string | null;
  shortName: string | null;
  marketHashName: string | null;
  iconUrl: string | null;
  sellMinPrice: number | null;
  buyMaxPrice: number | null;
  sellNum: number | null;
  buyNum: number | null;
  transactedNum: number | null;
  steamPriceCny: number | null;
  hasBuffPriceHistory: boolean;
}

export interface BuffMarketListResult {
  game: BuffGame;
  tab: BuffMarketTab;
  pageNum: number;
  pageSize: number;
  totalPage: number;
  totalCount: number;
  endpoint: string;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  items: BuffMarketListItem[];
  warnings: string[];
}

export interface BuffOrderItem {
  id: string;
  userId: string | null;
  price: number | null;
  num: number | null;
  stateText: string | null;
  payMethodText: string | null;
  iconUrl: string | null;
  paintwear: number | null;
  tradableCooldownText: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BuffOrderListResult {
  kind: "sell" | "buy" | "bill";
  goodsId: number;
  game: BuffGame;
  pageNum: number;
  pageSize: number;
  totalPage: number;
  totalCount: number;
  endpoint: string;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  items: BuffOrderItem[];
}

export interface BuffGoodsInfoSummary {
  goodsId: number;
  game: BuffGame;
  name: string | null;
  shortName: string | null;
  marketHashName: string | null;
  iconUrl: string | null;
  sellMinPrice: number | null;
  buyMaxPrice: number | null;
  sellNum: number | null;
  buyNum: number | null;
  transactedNum: number | null;
  hasBuffPriceHistory: boolean;
}

export interface BuffGoodsTab {
  id: number;
  name: string;
  text: string;
}

export interface BuffGoodsTabsResult {
  goodsId: number;
  endpoint: string;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  tabs: BuffGoodsTab[];
  goodsTabIds: number[];
}

export interface BuffEndpointStatus {
  key:
    | "goodsInfo"
    | "goodsTabs"
    | "priceHistory"
    | "historyDaysBuff"
    | "historyDaysSteam"
    | "sellOrders"
    | "buyOrders"
    | "billOrders";
  endpoint: string;
  ok: boolean;
  code: string;
  error: string | null;
}

export interface BuffGoodsDashboardResult {
  game: BuffGame;
  goodsId: number;
  days: number;
  currency: BuffCurrency;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  goodsInfo: BuffGoodsInfoSummary | null;
  goodsTabs: BuffGoodsTabsResult | null;
  priceHistory: BuffPriceHistoryResult | null;
  historyDaysBuff: BuffHistoryDaysResult | null;
  historyDaysSteam: BuffHistoryDaysResult | null;
  sellOrders: BuffOrderListResult | null;
  buyOrders: BuffOrderListResult | null;
  billOrders: BuffOrderListResult | null;
  endpointStatus: BuffEndpointStatus[];
  warnings: string[];
}

export interface FetchBuffAuthInput {
  requestCookie?: string | null;
  requestCsrfToken?: string | null;
}

export interface FetchBuffPriceHistoryInput extends FetchBuffAuthInput {
  goodsId: number;
  days?: number;
  game?: BuffGame;
  currency?: BuffCurrency;
  timeoutMs?: number;
}

export interface FetchBuffHistoryDaysInput extends FetchBuffAuthInput {
  goodsId: number;
  source: "buff" | "steam";
  game?: BuffGame;
  timeoutMs?: number;
}

export interface FetchBuffMarketListInput extends FetchBuffAuthInput {
  tab: BuffMarketTab;
  pageNum?: number;
  pageSize?: number;
  game?: BuffGame;
  search?: string | null;
  categoryGroup?: string | null;
  sortBy?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  timeoutMs?: number;
}

export interface FetchBuffOrderListInput extends FetchBuffAuthInput {
  goodsId: number;
  kind: "sell" | "buy" | "bill";
  pageNum?: number;
  game?: BuffGame;
  timeoutMs?: number;
}

export interface FetchBuffGoodsInfoInput extends FetchBuffAuthInput {
  goodsId: number;
  game?: BuffGame;
  timeoutMs?: number;
}

export interface FetchBuffGoodsTabsInput extends FetchBuffAuthInput {
  goodsId: number;
  timeoutMs?: number;
}

export interface FetchBuffGoodsDashboardInput extends FetchBuffAuthInput {
  goodsId: number;
  days?: number;
  game?: BuffGame;
  currency?: BuffCurrency;
  ordersPageNum?: number;
  timeoutMs?: number;
}

const BUFF_ORIGIN = "https://buff.163.com";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const PRIMARY_LINE_KEYS = ["sell_min_price_history", "sell_price_history", "sell_point", "buy_point"] as const;

const NO_STORE_FETCH_INIT = {
  method: "GET",
  cache: "no-store" as const,
};

const PointSchema = z.tuple([z.coerce.number(), z.coerce.number()]);

const DisabledConfirmSchema = z
  .object({
    title: z.string().optional(),
    message: z.string().optional(),
  })
  .nullable()
  .optional();

const LineSchema = z.object({
  key: z.string(),
  name: z.string(),
  show: z.boolean().optional().default(false),
  allow: z.boolean().optional().default(false),
  color: z.string().optional().nullable(),
  chart_type: z.string().optional().default("price"),
  points: z.array(PointSchema).optional().default([]),
  disabled_confirm: DisabledConfirmSchema,
});

const BuffPayloadSchema = z.object({
  code: z.string(),
  msg: z.unknown().optional(),
  error: z.string().optional().nullable(),
  data: z.unknown().optional().nullable(),
});

const HistoryDaysDataSchema = z.object({
  options: z
    .array(
      z.object({
        days: z.coerce.number(),
        text: z.string().optional().default(""),
        disabled: z.boolean().optional().default(false),
        disabled_confirm: DisabledConfirmSchema,
      }),
    )
    .optional()
    .default([]),
});

const MarketListDataSchema = z.object({
  page_num: z.coerce.number().optional().default(1),
  page_size: z.coerce.number().optional().default(20),
  total_page: z.coerce.number().optional().default(0),
  total_count: z.coerce.number().optional().default(0),
  items: z.array(z.unknown()).optional().default([]),
});

const OrderListDataSchema = z.object({
  page_num: z.coerce.number().optional().default(1),
  page_size: z.coerce.number().optional().default(10),
  total_page: z.coerce.number().optional().default(0),
  total_count: z.coerce.number().optional().default(0),
  items: z.array(z.unknown()).optional().default([]),
});

const GoodsTabsDataSchema = z.object({
  all_tabs: z
    .array(
      z.object({
        id: z.coerce.number(),
        name: z.string(),
        text: z.string(),
      }),
    )
    .optional()
    .default([]),
  goods_tab_ids: z.array(z.coerce.number()).optional().default([]),
});

class BuffApiCodeError extends Error {
  code: string;
  endpoint: string;

  constructor(args: { code: string; endpoint: string; message: string }) {
    super(args.message);
    this.name = "BuffApiCodeError";
    this.code = args.code;
    this.endpoint = args.endpoint;
  }
}

type ResolvedAuth = {
  cookie: string | null;
  csrfToken: string | null;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function toInteger(value: unknown): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return false;
}

function unixSecondsToIso(value: unknown): string | null {
  const sec = toNumber(value);
  if (sec === null) return null;
  const ms = sec > 1_000_000_000_000 ? sec : sec * 1_000;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function resolveAuth(input: FetchBuffAuthInput | undefined): ResolvedAuth {
  const envCookie = normalizeOptionalText(process.env.BUFF_COOKIE);
  const envCsrfToken = normalizeOptionalText(process.env.BUFF_CSRF_TOKEN);
  const requestCookie = normalizeOptionalText(input?.requestCookie ?? null);
  const requestCsrfToken = normalizeOptionalText(input?.requestCsrfToken ?? null);

  const cookie = requestCookie ?? envCookie;
  const csrfToken = requestCsrfToken ?? envCsrfToken;

  return {
    cookie,
    csrfToken,
    auth: {
      cookieSource: requestCookie ? "request" : envCookie ? "env" : "none",
      csrfSource: requestCsrfToken ? "request" : envCsrfToken ? "env" : "none",
    },
  };
}

function buildEndpoint(path: string, params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return `${BUFF_ORIGIN}${path}?${search.toString()}`;
}

function buildHeaders(args: { resolvedAuth: ResolvedAuth; refererPath: string }): HeadersInit {
  const headers: HeadersInit = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    referer: `${BUFF_ORIGIN}${args.refererPath}`,
    "user-agent": process.env.BUFF_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
    "x-requested-with": "XMLHttpRequest",
  };

  if (args.resolvedAuth.cookie) {
    headers.Cookie = args.resolvedAuth.cookie;
  }
  if (args.resolvedAuth.csrfToken) {
    headers["x-csrftoken"] = args.resolvedAuth.csrfToken;
  }

  return headers;
}

async function requestBuffApi(args: {
  path: string;
  params: Record<string, string | number | null | undefined>;
  refererPath: string;
  authInput?: FetchBuffAuthInput;
  timeoutMs?: number;
}): Promise<{
  envelope: z.infer<typeof BuffPayloadSchema>;
  endpoint: string;
  auth: ResolvedAuth["auth"];
}> {
  const endpoint = buildEndpoint(args.path, args.params);
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const resolvedAuth = resolveAuth(args.authInput);

  const response = await fetch(endpoint, {
    ...NO_STORE_FETCH_INIT,
    headers: buildHeaders({ resolvedAuth, refererPath: args.refererPath }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = (await response.text().catch(() => "")).trim();
    const hint = text ? `; ${text.slice(0, 180)}` : "";
    throw new Error(`BUFF 接口返回 ${response.status}${hint}`);
  }

  const raw = (await response.json()) as unknown;
  const envelope = BuffPayloadSchema.parse(raw);

  return {
    envelope,
    endpoint,
    auth: resolvedAuth.auth,
  };
}

function ensureOk(envelope: z.infer<typeof BuffPayloadSchema>, endpoint: string): unknown {
  if (envelope.code !== "OK") {
    const error = normalizeOptionalText(envelope.error) ?? normalizeOptionalText(typeof envelope.msg === "string" ? envelope.msg : null) ?? "unknown";
    throw new BuffApiCodeError({
      code: envelope.code,
      endpoint,
      message: `BUFF 接口返回 code=${envelope.code}, error=${error}`,
    });
  }
  return envelope.data ?? null;
}

function toIsoTime(timestampMs: number): string | null {
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function normalizeSeries(points: Array<[number, number]>): BuffSeriesPoint[] {
  return points
    .map(([rawTs, rawPrice]) => {
      const timestampMs = Number(rawTs);
      const price = Number(rawPrice);
      if (!Number.isFinite(timestampMs) || !Number.isFinite(price)) return null;
      const at = toIsoTime(timestampMs);
      if (!at) return null;
      return {
        timestampMs,
        at,
        price: Number(price.toFixed(4)),
      };
    })
    .filter((item): item is BuffSeriesPoint => item !== null)
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

function calcChangePct(firstPrice: number | null, latestPrice: number | null): number | null {
  if (firstPrice === null || latestPrice === null || firstPrice <= 0) return null;
  return Number((((latestPrice - firstPrice) / firstPrice) * 100).toFixed(2));
}

function summarizeLine(line: z.infer<typeof LineSchema>): BuffPriceLineSummary {
  const points = normalizeSeries(line.points);
  const first = points.at(0) ?? null;
  const latest = points.at(-1) ?? null;
  const prices = points.map((point) => point.price);
  const minPrice = prices.length ? Number(Math.min(...prices).toFixed(4)) : null;
  const maxPrice = prices.length ? Number(Math.max(...prices).toFixed(4)) : null;
  const gateMessage = normalizeOptionalText(line.disabled_confirm?.message) ?? normalizeOptionalText(line.disabled_confirm?.title);

  return {
    key: line.key,
    name: line.name,
    chartType: line.chart_type,
    color: line.color ?? null,
    allow: line.allow,
    show: line.show,
    pointCount: points.length,
    points,
    firstAt: first?.at ?? null,
    latestAt: latest?.at ?? null,
    firstPrice: first?.price ?? null,
    latestPrice: latest?.price ?? null,
    minPrice,
    maxPrice,
    changePct: calcChangePct(first?.price ?? null, latest?.price ?? null),
    isGated: points.length === 0 && Boolean(line.disabled_confirm),
    gateMessage,
  };
}

function pickPrimaryLine(lines: BuffPriceLineSummary[]): BuffPriceLineSummary | null {
  for (const key of PRIMARY_LINE_KEYS) {
    const matched = lines.find((line) => line.key === key && line.points.length > 0);
    if (matched) return matched;
  }
  return lines.find((line) => line.points.length > 0) ?? null;
}

function normalizeMarketItem(raw: unknown): BuffMarketListItem | null {
  const row = asRecord(raw);
  const goodsId = toInteger(row.id) ?? toInteger(row.goods_id);
  if (goodsId === null || goodsId <= 0) return null;
  const goodsInfo = asRecord(row.goods_info);

  return {
    goodsId,
    name: normalizeOptionalText(String(row.name ?? "")),
    shortName: normalizeOptionalText(String(row.short_name ?? "")),
    marketHashName: normalizeOptionalText(String(row.market_hash_name ?? "")),
    iconUrl: normalizeOptionalText(String(goodsInfo.icon_url ?? row.icon_url ?? "")),
    sellMinPrice: toNumber(row.sell_min_price),
    buyMaxPrice: toNumber(row.buy_max_price),
    sellNum: toInteger(row.sell_num),
    buyNum: toInteger(row.buy_num),
    transactedNum: toInteger(row.transacted_num),
    steamPriceCny: toNumber(goodsInfo.steam_price_cny),
    hasBuffPriceHistory: toBoolean(row.has_buff_price_history),
  };
}

function normalizeOrderItem(raw: unknown): BuffOrderItem | null {
  const row = asRecord(raw);
  const assetInfo = asRecord(row.asset_info);
  const info = asRecord(assetInfo.info);
  const iconUrl = normalizeOptionalText(String(info.icon_url ?? row.icon_url ?? ""));

  const idRaw = row.id;
  const id = idRaw === null || idRaw === undefined ? null : String(idRaw);
  if (!id) return null;

  return {
    id,
    userId: normalizeOptionalText(String(row.user_id ?? row.buyer_id ?? row.seller_id ?? "")),
    price: toNumber(row.price),
    num: toInteger(row.num),
    stateText: normalizeOptionalText(String(row.state_text ?? "")),
    payMethodText: normalizeOptionalText(String(row.pay_method_text ?? "")),
    iconUrl,
    paintwear: toNumber(assetInfo.paintwear),
    tradableCooldownText: normalizeOptionalText(String(assetInfo.tradable_cooldown_text ?? row.tradable_cooldown ?? "")),
    createdAt: unixSecondsToIso(row.created_at),
    updatedAt: unixSecondsToIso(row.updated_at),
  };
}

function normalizeGoodsInfo(data: unknown, game: BuffGame): BuffGoodsInfoSummary | null {
  const row = asRecord(data);
  const goodsId = toInteger(row.id);
  if (goodsId === null || goodsId <= 0) return null;
  const goodsInfo = asRecord(row.goods_info);

  return {
    goodsId,
    game,
    name: normalizeOptionalText(String(row.name ?? "")),
    shortName: normalizeOptionalText(String(row.short_name ?? "")),
    marketHashName: normalizeOptionalText(String(row.market_hash_name ?? "")),
    iconUrl: normalizeOptionalText(String(goodsInfo.icon_url ?? "")),
    sellMinPrice: toNumber(row.sell_min_price),
    buyMaxPrice: toNumber(row.buy_max_price),
    sellNum: toInteger(row.sell_num),
    buyNum: toInteger(row.buy_num),
    transactedNum: toInteger(row.transacted_num),
    hasBuffPriceHistory: toBoolean(row.has_buff_price_history),
  };
}

function normalizeHistoryDayOption(raw: z.infer<typeof HistoryDaysDataSchema>["options"][number]): BuffHistoryDayOption {
  const gateMessage = normalizeOptionalText(raw.disabled_confirm?.message) ?? normalizeOptionalText(raw.disabled_confirm?.title);
  return {
    days: raw.days,
    text: raw.text,
    disabled: raw.disabled,
    gateMessage,
  };
}

function normalizeCode(error: unknown): string {
  if (error instanceof BuffApiCodeError) return error.code;
  return "ERROR";
}

function normalizeEndpoint(error: unknown): string {
  if (error instanceof BuffApiCodeError) return error.endpoint;
  return "";
}

export async function fetchBuffPriceHistory(input: FetchBuffPriceHistoryInput): Promise<BuffPriceHistoryResult> {
  const goodsId = input.goodsId;
  const game = input.game ?? "csgo";
  const currency = input.currency ?? "CNY";
  const days = input.days ?? 30;

  const { envelope, endpoint, auth } = await requestBuffApi({
    path: "/api/market/goods/price_history/buff/v2",
    params: {
      game,
      goods_id: goodsId,
      currency,
      days,
      _: Date.now(),
    },
    refererPath: `/goods/${goodsId}?from=market`,
    authInput: {
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
    },
    timeoutMs: input.timeoutMs,
  });

  const dataRaw = ensureOk(envelope, endpoint);
  const parsed = z
    .object({
      currency: z.string().optional(),
      currency_symbol: z.string().optional(),
      days: z.coerce.number().optional(),
      price_type: z.string().optional(),
      lines: z.array(LineSchema).optional().default([]),
    })
    .parse(dataRaw);

  const lines = parsed.lines.map(summarizeLine);
  const primaryLine = pickPrimaryLine(lines);
  const warnings: string[] = [];

  if (auth.cookieSource === "none") {
    warnings.push("未提供 BUFF Cookie，部分字段可能被风控或会员权益限制。");
  }

  if (!primaryLine) {
    warnings.push("未拿到可用价格序列，请检查 goods_id、Cookie 是否有效，或该物品近期无成交。");
  }

  const gatedLineCount = lines.filter((line) => line.isGated).length;
  if (gatedLineCount > 0) {
    warnings.push(`检测到 ${gatedLineCount} 条曲线受会员权益限制（如求购最高/在售数量）。`);
  }

  return {
    game,
    goodsId,
    days,
    currency,
    currencyLabel: parsed.currency ?? currency,
    currencySymbol: parsed.currency_symbol ?? (currency === "CNY" ? "¥" : "$"),
    priceType: parsed.price_type ?? "BUFF价格",
    endpoint,
    fetchedAt: new Date().toISOString(),
    auth,
    lines,
    primaryLineKey: primaryLine?.key ?? null,
    primarySeries: primaryLine
      ? {
          key: primaryLine.key,
          name: primaryLine.name,
          points: primaryLine.points,
        }
      : null,
    warnings,
  };
}

export async function fetchBuffHistoryDays(input: FetchBuffHistoryDaysInput): Promise<BuffHistoryDaysResult> {
  const source = input.source;
  const game = input.game ?? "csgo";
  const goodsId = input.goodsId;
  const path = source === "buff" ? "/api/market/goods/price_history/buff/days" : "/api/market/goods/price_history/steam/days";

  const { envelope, endpoint, auth } = await requestBuffApi({
    path,
    params: {
      game,
      goods_id: goodsId,
      _: Date.now(),
    },
    refererPath: `/goods/${goodsId}?from=market`,
    authInput: {
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
    },
    timeoutMs: input.timeoutMs,
  });

  const dataRaw = ensureOk(envelope, endpoint);
  const parsed = HistoryDaysDataSchema.parse(dataRaw);

  return {
    source,
    game,
    goodsId,
    endpoint,
    fetchedAt: new Date().toISOString(),
    auth,
    options: parsed.options.map(normalizeHistoryDayOption),
  };
}

function marketTabEndpoint(tab: BuffMarketTab): string {
  if (tab === "buying") return "/api/market/goods/buying";
  if (tab === "bundle") return "/api/market/goods/bundle";
  if (tab === "all") return "/api/market/goods/all";
  return "/api/market/goods";
}

export async function fetchBuffMarketList(input: FetchBuffMarketListInput): Promise<BuffMarketListResult> {
  const tab = input.tab;
  const game = input.game ?? "csgo";
  const pageNum = input.pageNum ?? 1;
  const pageSize = input.pageSize ?? 20;
  const path = marketTabEndpoint(tab);

  const { envelope, endpoint, auth } = await requestBuffApi({
    path,
    params: {
      game,
      page_num: pageNum,
      page_size: pageSize,
      tab,
      search: normalizeOptionalText(input.search ?? null),
      category_group: normalizeOptionalText(input.categoryGroup ?? null),
      sort_by: normalizeOptionalText(input.sortBy ?? null),
      min_price: input.minPrice ?? undefined,
      max_price: input.maxPrice ?? undefined,
      _: Date.now(),
    },
    refererPath: `/?game=${game}`,
    authInput: {
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
    },
    timeoutMs: input.timeoutMs,
  });

  const dataRaw = ensureOk(envelope, endpoint);
  const parsed = MarketListDataSchema.parse(dataRaw);
  const items = parsed.items.map(normalizeMarketItem).filter((item): item is BuffMarketListItem => item !== null);

  const warnings: string[] = [];
  if (auth.cookieSource === "none" && tab === "all") {
    warnings.push("`all` 搜索接口常要求登录态，若报登录错误请配置 BUFF_COOKIE。");
  }

  return {
    game,
    tab,
    pageNum: parsed.page_num,
    pageSize: parsed.page_size,
    totalPage: parsed.total_page,
    totalCount: parsed.total_count,
    endpoint,
    fetchedAt: new Date().toISOString(),
    auth,
    items,
    warnings,
  };
}

function orderEndpoint(kind: FetchBuffOrderListInput["kind"]): string {
  if (kind === "buy") return "/api/market/goods/buy_order";
  if (kind === "bill") return "/api/market/goods/bill_order";
  return "/api/market/goods/sell_order";
}

export async function fetchBuffOrderList(input: FetchBuffOrderListInput): Promise<BuffOrderListResult> {
  const kind = input.kind;
  const goodsId = input.goodsId;
  const game = input.game ?? "csgo";
  const pageNum = input.pageNum ?? 1;

  const params: Record<string, string | number | null | undefined> = {
    game,
    goods_id: goodsId,
    page_num: pageNum,
    sort_by: "default",
    _: Date.now(),
  };

  if (kind === "sell") {
    params.mode = "";
    params.allow_tradable_cooldown = 1;
  }
  if (kind === "bill") {
    params.allow_tradable_cooldown = 1;
  }

  const { envelope, endpoint, auth } = await requestBuffApi({
    path: orderEndpoint(kind),
    params,
    refererPath: `/goods/${goodsId}?from=market`,
    authInput: {
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
    },
    timeoutMs: input.timeoutMs,
  });

  const dataRaw = ensureOk(envelope, endpoint);
  const parsed = OrderListDataSchema.parse(dataRaw);

  return {
    kind,
    goodsId,
    game,
    pageNum: parsed.page_num,
    pageSize: parsed.page_size,
    totalPage: parsed.total_page,
    totalCount: parsed.total_count,
    endpoint,
    fetchedAt: new Date().toISOString(),
    auth,
    items: parsed.items.map(normalizeOrderItem).filter((item): item is BuffOrderItem => item !== null),
  };
}

export async function fetchBuffGoodsInfo(input: FetchBuffGoodsInfoInput): Promise<{
  endpoint: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  result: BuffGoodsInfoSummary | null;
}> {
  const goodsId = input.goodsId;
  const game = input.game ?? "csgo";

  const { envelope, endpoint, auth } = await requestBuffApi({
    path: "/api/market/goods/info",
    params: {
      game,
      goods_id: goodsId,
      _: Date.now(),
    },
    refererPath: `/goods/${goodsId}?from=market`,
    authInput: {
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
    },
    timeoutMs: input.timeoutMs,
  });

  const dataRaw = ensureOk(envelope, endpoint);
  return {
    endpoint,
    auth,
    result: normalizeGoodsInfo(dataRaw, game),
  };
}

export async function fetchBuffGoodsTabs(input: FetchBuffGoodsTabsInput): Promise<BuffGoodsTabsResult> {
  const goodsId = input.goodsId;

  const { envelope, endpoint, auth } = await requestBuffApi({
    path: "/api/market/goods_tab_list",
    params: {
      goods_id: goodsId,
      _: Date.now(),
    },
    refererPath: `/goods/${goodsId}?from=market`,
    authInput: {
      requestCookie: input.requestCookie,
      requestCsrfToken: input.requestCsrfToken,
    },
    timeoutMs: input.timeoutMs,
  });

  const dataRaw = ensureOk(envelope, endpoint);
  const parsed = GoodsTabsDataSchema.parse(dataRaw);

  return {
    goodsId,
    endpoint,
    fetchedAt: new Date().toISOString(),
    auth,
    tabs: parsed.all_tabs,
    goodsTabIds: parsed.goods_tab_ids,
  };
}

export async function fetchBuffGoodsDashboard(input: FetchBuffGoodsDashboardInput): Promise<BuffGoodsDashboardResult> {
  const goodsId = input.goodsId;
  const game = input.game ?? "csgo";
  const days = input.days ?? 30;
  const currency = input.currency ?? "CNY";
  const ordersPageNum = input.ordersPageNum ?? 1;

  const endpointStatus: BuffEndpointStatus[] = [];
  const warnings: string[] = [];

  const auth = resolveAuth({
    requestCookie: input.requestCookie,
    requestCsrfToken: input.requestCsrfToken,
  }).auth;

  const capture = async <T,>(
    key: BuffEndpointStatus["key"],
    endpointFallback: string,
    fn: () => Promise<T>,
  ): Promise<T | null> => {
    try {
      const result = await fn();
      const endpoint =
        typeof result === "object" && result !== null && "endpoint" in result && typeof (result as { endpoint?: unknown }).endpoint === "string"
          ? String((result as { endpoint: string }).endpoint)
          : endpointFallback;

      endpointStatus.push({
        key,
        endpoint,
        ok: true,
        code: "OK",
        error: null,
      });
      return result;
    } catch (error) {
      const endpoint = normalizeEndpoint(error) || endpointFallback;
      const code = normalizeCode(error);
      const message = safeErrorMessage(error);
      endpointStatus.push({
        key,
        endpoint,
        ok: false,
        code,
        error: message,
      });
      return null;
    }
  };

  const [goodsInfoWrap, goodsTabs, priceHistory, historyDaysBuff, historyDaysSteam, sellOrders, buyOrders, billOrders] = await Promise.all([
    capture("goodsInfo", "/api/market/goods/info", () =>
      fetchBuffGoodsInfo({
        goodsId,
        game,
        requestCookie: input.requestCookie,
        requestCsrfToken: input.requestCsrfToken,
        timeoutMs: input.timeoutMs,
      }),
    ),
    capture("goodsTabs", "/api/market/goods_tab_list", () =>
      fetchBuffGoodsTabs({
        goodsId,
        requestCookie: input.requestCookie,
        requestCsrfToken: input.requestCsrfToken,
        timeoutMs: input.timeoutMs,
      }),
    ),
    capture("priceHistory", "/api/market/goods/price_history/buff/v2", () =>
      fetchBuffPriceHistory({
        goodsId,
        game,
        days,
        currency,
        requestCookie: input.requestCookie,
        requestCsrfToken: input.requestCsrfToken,
        timeoutMs: input.timeoutMs,
      }),
    ),
    capture("historyDaysBuff", "/api/market/goods/price_history/buff/days", () =>
      fetchBuffHistoryDays({
        goodsId,
        game,
        source: "buff",
        requestCookie: input.requestCookie,
        requestCsrfToken: input.requestCsrfToken,
        timeoutMs: input.timeoutMs,
      }),
    ),
    capture("historyDaysSteam", "/api/market/goods/price_history/steam/days", () =>
      fetchBuffHistoryDays({
        goodsId,
        game,
        source: "steam",
        requestCookie: input.requestCookie,
        requestCsrfToken: input.requestCsrfToken,
        timeoutMs: input.timeoutMs,
      }),
    ),
    capture("sellOrders", "/api/market/goods/sell_order", () =>
      fetchBuffOrderList({
        kind: "sell",
        goodsId,
        game,
        pageNum: ordersPageNum,
        requestCookie: input.requestCookie,
        requestCsrfToken: input.requestCsrfToken,
        timeoutMs: input.timeoutMs,
      }),
    ),
    capture("buyOrders", "/api/market/goods/buy_order", () =>
      fetchBuffOrderList({
        kind: "buy",
        goodsId,
        game,
        pageNum: ordersPageNum,
        requestCookie: input.requestCookie,
        requestCsrfToken: input.requestCsrfToken,
        timeoutMs: input.timeoutMs,
      }),
    ),
    capture("billOrders", "/api/market/goods/bill_order", () =>
      fetchBuffOrderList({
        kind: "bill",
        goodsId,
        game,
        pageNum: ordersPageNum,
        requestCookie: input.requestCookie,
        requestCsrfToken: input.requestCsrfToken,
        timeoutMs: input.timeoutMs,
      }),
    ),
  ]);

  if (auth.cookieSource === "none") {
    warnings.push("当前未配置 BUFF_COOKIE，`bill_order` 和部分价格历史能力可能不可用。");
  }

  if (!priceHistory) {
    warnings.push("价格历史拉取失败，通常与登录态或权益限制有关。");
  }

  return {
    game,
    goodsId,
    days,
    currency,
    fetchedAt: new Date().toISOString(),
    auth,
    goodsInfo: goodsInfoWrap?.result ?? null,
    goodsTabs,
    priceHistory,
    historyDaysBuff,
    historyDaysSteam,
    sellOrders,
    buyOrders,
    billOrders,
    endpointStatus,
    warnings,
  };
}
