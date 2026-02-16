import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchValveImpactForGoods } from "@/lib/data/valve-updates";

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
  game: z.literal("csgo").optional().default("csgo"),
  days: z.coerce.number().int().min(1).max(120).optional().default(30),
  currency: z.enum(["CNY", "USD"]).optional().default("CNY"),
  eventLimit: z.coerce.number().int().min(1).max(24).optional().default(12),
  timeoutMs: z.coerce.number().int().min(500).max(20_000).optional(),
  cookie: OptionalCookieSchema,
  csrfToken: OptionalTokenSchema,
});

function parseGetInput(request: Request): z.infer<typeof InputSchema> {
  const url = new URL(request.url);
  return InputSchema.parse({
    goodsId: url.searchParams.get("goodsId") ?? url.searchParams.get("goods_id") ?? undefined,
    game: url.searchParams.get("game") ?? undefined,
    days: url.searchParams.get("days") ?? undefined,
    currency: url.searchParams.get("currency") ?? undefined,
    eventLimit: url.searchParams.get("eventLimit") ?? url.searchParams.get("event_limit") ?? undefined,
    timeoutMs: url.searchParams.get("timeoutMs") ?? url.searchParams.get("timeout_ms") ?? undefined,
  });
}

async function run(input: z.infer<typeof InputSchema>) {
  return fetchValveImpactForGoods({
    goodsId: input.goodsId,
    game: input.game,
    days: input.days,
    currency: input.currency,
    eventLimit: input.eventLimit,
    timeoutMs: input.timeoutMs,
    requestCookie: input.cookie,
    requestCsrfToken: input.csrfToken,
  });
}

export async function GET(request: Request) {
  let input: z.infer<typeof InputSchema>;
  try {
    input = parseGetInput(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Valve impact query";
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
    const message = error instanceof Error ? error.message : "Unknown Valve impact error";
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
    const message = error instanceof Error ? error.message : "Invalid Valve impact payload";
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
    const message = error instanceof Error ? error.message : "Unknown Valve impact error";
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
