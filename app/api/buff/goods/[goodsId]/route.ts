import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchBuffGoodsDashboard } from "@/lib/buff";

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
  goodsId: z.coerce.number().int().min(1).max(1_000_000_000),
  days: z.coerce.number().int().min(1).max(120).optional().default(30),
  ordersPageNum: z.coerce.number().int().min(1).max(100).optional().default(1),
  currency: z.enum(["CNY", "USD"]).optional().default("CNY"),
  game: z.literal("csgo").optional().default("csgo"),
  cookie: OptionalCookieSchema,
  csrfToken: OptionalTokenSchema,
});

type RouteContext = {
  params: {
    goodsId: string;
  };
};

function parseGetInput(request: Request, context: RouteContext): z.infer<typeof InputSchema> {
  const url = new URL(request.url);
  return InputSchema.parse({
    goodsId: context.params.goodsId,
    days: url.searchParams.get("days") ?? undefined,
    ordersPageNum: url.searchParams.get("ordersPageNum") ?? url.searchParams.get("orders_page_num") ?? undefined,
    currency: url.searchParams.get("currency") ?? undefined,
    game: url.searchParams.get("game") ?? undefined,
  });
}

async function run(input: z.infer<typeof InputSchema>) {
  return fetchBuffGoodsDashboard({
    goodsId: input.goodsId,
    days: input.days,
    ordersPageNum: input.ordersPageNum,
    currency: input.currency,
    game: input.game,
    requestCookie: input.cookie,
    requestCsrfToken: input.csrfToken,
  });
}

export async function GET(request: Request, context: RouteContext) {
  let input: z.infer<typeof InputSchema>;
  try {
    input = parseGetInput(request, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid BUFF goods query";
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
    const message = error instanceof Error ? error.message : "Unknown BUFF goods error";
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

export async function POST(request: Request, context: RouteContext) {
  let input: z.infer<typeof InputSchema>;
  try {
    const body = (await request.json()) as unknown;
    input = InputSchema.parse({
      goodsId: context.params.goodsId,
      ...((body && typeof body === "object") ? body : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid BUFF goods payload";
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
    const message = error instanceof Error ? error.message : "Unknown BUFF goods error";
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
