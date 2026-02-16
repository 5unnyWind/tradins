import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchBuffMarketList } from "@/lib/buff";

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

const OptionalTextSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().max(200).optional(),
);

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
  tab: z.enum(["selling", "buying", "bundle", "all"]).optional().default("selling"),
  game: z.literal("csgo").optional().default("csgo"),
  pageNum: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(80).optional().default(20),
  search: OptionalTextSchema,
  categoryGroup: OptionalTextSchema,
  sortBy: OptionalTextSchema,
  minPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  maxPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  cookie: OptionalCookieSchema,
  csrfToken: OptionalTokenSchema,
});

function parseGetInput(request: Request): z.infer<typeof InputSchema> {
  const url = new URL(request.url);
  return InputSchema.parse({
    tab: url.searchParams.get("tab") ?? undefined,
    game: url.searchParams.get("game") ?? undefined,
    pageNum: url.searchParams.get("pageNum") ?? url.searchParams.get("page_num") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? url.searchParams.get("page_size") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    categoryGroup: url.searchParams.get("categoryGroup") ?? url.searchParams.get("category_group") ?? undefined,
    sortBy: url.searchParams.get("sortBy") ?? url.searchParams.get("sort_by") ?? undefined,
    minPrice: url.searchParams.get("minPrice") ?? url.searchParams.get("min_price") ?? undefined,
    maxPrice: url.searchParams.get("maxPrice") ?? url.searchParams.get("max_price") ?? undefined,
  });
}

async function run(input: z.infer<typeof InputSchema>) {
  return fetchBuffMarketList({
    tab: input.tab,
    game: input.game,
    pageNum: input.pageNum,
    pageSize: input.pageSize,
    search: input.search,
    categoryGroup: input.categoryGroup,
    sortBy: input.sortBy,
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
    requestCookie: input.cookie,
    requestCsrfToken: input.csrfToken,
  });
}

export async function GET(request: Request) {
  let input: z.infer<typeof InputSchema>;
  try {
    input = parseGetInput(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid BUFF market query";
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
    const message = error instanceof Error ? error.message : "Unknown BUFF market error";
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

export async function POST(request: Request) {
  let input: z.infer<typeof InputSchema>;
  try {
    const body = (await request.json()) as unknown;
    input = InputSchema.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid BUFF market payload";
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
    const message = error instanceof Error ? error.message : "Unknown BUFF market error";
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
