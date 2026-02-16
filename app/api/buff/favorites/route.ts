import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchBuffGoodsInfo, type BuffAuthSource, type BuffGame, type BuffMarketListItem } from "@/lib/buff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
};

const OptionalCookieSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().max(10_000).optional(),
);

const OptionalTokenSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().max(512).optional(),
);

const InputSchema = z.object({
  goodsIds: z.array(z.coerce.number().int().min(1).max(1_000_000_000)).min(1).max(300),
  game: z.literal("csgo").optional().default("csgo"),
  cookie: OptionalCookieSchema,
  csrfToken: OptionalTokenSchema,
});

type FavoritesEndpointStatus = {
  goodsId: number;
  endpoint: string;
  ok: boolean;
  code: string;
  error: string | null;
};

type FavoritesLookupResult = {
  game: BuffGame;
  fetchedAt: string;
  auth: {
    cookieSource: BuffAuthSource;
    csrfSource: BuffAuthSource;
  };
  requestedCount: number;
  successCount: number;
  failedGoodsIds: number[];
  items: BuffMarketListItem[];
  endpointStatus: FavoritesEndpointStatus[];
  warnings: string[];
};

function normalizeGoodsIds(goodsIds: number[]): number[] {
  const uniqueGoodsIds: number[] = [];
  const seen = new Set<number>();
  for (const goodsId of goodsIds) {
    if (seen.has(goodsId)) continue;
    seen.add(goodsId);
    uniqueGoodsIds.push(goodsId);
  }
  return uniqueGoodsIds;
}

function toMarketListItem(info: NonNullable<Awaited<ReturnType<typeof fetchBuffGoodsInfo>>["result"]>): BuffMarketListItem {
  return {
    goodsId: info.goodsId,
    name: info.name,
    shortName: info.shortName,
    marketHashName: info.marketHashName,
    iconUrl: info.iconUrl,
    sellMinPrice: info.sellMinPrice,
    buyMaxPrice: info.buyMaxPrice,
    sellNum: info.sellNum,
    buyNum: info.buyNum,
    transactedNum: info.transactedNum,
    steamPriceCny: null,
    hasBuffPriceHistory: info.hasBuffPriceHistory,
  };
}

function normalizeCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return String((error as { code: string }).code);
  }
  return "ERROR";
}

function normalizeEndpoint(error: unknown): string {
  if (typeof error === "object" && error !== null && "endpoint" in error && typeof (error as { endpoint?: unknown }).endpoint === "string") {
    return String((error as { endpoint: string }).endpoint);
  }
  return "/api/market/goods/info";
}

async function run(input: z.infer<typeof InputSchema>): Promise<FavoritesLookupResult> {
  const goodsIds = normalizeGoodsIds(input.goodsIds);
  const endpointStatus: FavoritesEndpointStatus[] = [];
  const itemMap = new Map<number, BuffMarketListItem>();
  const warnings: string[] = [];
  let auth: FavoritesLookupResult["auth"] = {
    cookieSource: "none",
    csrfSource: "none",
  };

  const chunkSize = 8;
  for (let index = 0; index < goodsIds.length; index += chunkSize) {
    const chunk = goodsIds.slice(index, index + chunkSize);
    await Promise.all(
      chunk.map(async (goodsId) => {
        try {
          const infoResult = await fetchBuffGoodsInfo({
            goodsId,
            game: input.game,
            requestCookie: input.cookie,
            requestCsrfToken: input.csrfToken,
          });

          auth = infoResult.auth;

          if (!infoResult.result) {
            endpointStatus.push({
              goodsId,
              endpoint: infoResult.endpoint,
              ok: false,
              code: "EMPTY",
              error: "未返回商品信息",
            });
            return;
          }

          itemMap.set(goodsId, toMarketListItem(infoResult.result));
          endpointStatus.push({
            goodsId,
            endpoint: infoResult.endpoint,
            ok: true,
            code: "OK",
            error: null,
          });
        } catch (error) {
          endpointStatus.push({
            goodsId,
            endpoint: normalizeEndpoint(error),
            ok: false,
            code: normalizeCode(error),
            error: error instanceof Error ? error.message : "未知错误",
          });
        }
      }),
    );
  }

  const items = goodsIds
    .map((goodsId) => itemMap.get(goodsId))
    .filter((item): item is BuffMarketListItem => item !== undefined);

  const failedGoodsIds = goodsIds.filter((goodsId) => !itemMap.has(goodsId));

  if (auth.cookieSource === "none") {
    warnings.push("当前未配置 BUFF_COOKIE，部分收藏商品可能无法获取完整价格字段。");
  }
  if (failedGoodsIds.length) {
    warnings.push(`收藏商品中有 ${failedGoodsIds.length} 项拉取失败，可稍后重试。`);
  }

  return {
    game: input.game,
    fetchedAt: new Date().toISOString(),
    auth,
    requestedCount: goodsIds.length,
    successCount: items.length,
    failedGoodsIds,
    items,
    endpointStatus,
    warnings,
  };
}

export async function POST(request: Request) {
  let input: z.infer<typeof InputSchema>;
  try {
    const body = (await request.json()) as unknown;
    input = InputSchema.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid BUFF favorites payload";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 400,
        headers: noStoreHeaders,
      },
    );
  }

  try {
    const result = await run(input);
    return NextResponse.json(
      {
        ok: true,
        result,
      },
      {
        headers: noStoreHeaders,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown BUFF favorites error";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
        headers: noStoreHeaders,
      },
    );
  }
}
