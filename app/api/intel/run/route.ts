import { NextResponse } from "next/server";
import { z } from "zod";

import { runIntelPipeline } from "@/lib/intel-runner";

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

const OptionalBooleanSchema = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}, z.boolean().optional());

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

const GoodsIdsSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value;
  return undefined;
}, z.array(z.coerce.number().int().min(1).max(1_000_000_000)).min(1).max(50).optional());

const ProvidersSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) return value;
  return undefined;
}, z.array(z.enum(["valve", "pro"])).min(1).max(2).optional());

const InputSchema = z.object({
  force: OptionalBooleanSchema.default(false),
  goodsIds: GoodsIdsSchema,
  providers: ProvidersSchema,
  days: z.coerce.number().int().min(1).max(120).optional(),
  eventLimit: z.coerce.number().int().min(1).max(40).optional(),
  timeoutMs: z.coerce.number().int().min(500).max(20_000).optional(),
  currency: z.enum(["CNY", "USD"]).optional(),
  cookie: OptionalCookieSchema,
  csrfToken: OptionalTokenSchema,
});

function resolveAllowedTokens(): string[] {
  const intelToken = (process.env.INTEL_RUN_TOKEN ?? "").trim();
  const schedulerToken = (process.env.SCHEDULER_RUN_TOKEN ?? "").trim();
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  return [intelToken, schedulerToken, cronSecret].filter((token) => token.length > 0);
}

function isAuthorized(request: Request, allowedTokens: string[]): boolean {
  if (!allowedTokens.length) return false;
  const headerToken = request.headers.get("x-scheduler-token")?.trim();
  if (headerToken && allowedTokens.includes(headerToken)) return true;
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    if (allowedTokens.includes(bearer)) return true;
  }
  return false;
}

function parseGetInput(request: Request): z.infer<typeof InputSchema> {
  const url = new URL(request.url);
  return InputSchema.parse({
    force: url.searchParams.get("force") ?? undefined,
    goodsIds: url.searchParams.get("goodsIds") ?? url.searchParams.get("goods_ids") ?? undefined,
    providers: url.searchParams.get("providers") ?? undefined,
    days: url.searchParams.get("days") ?? undefined,
    eventLimit: url.searchParams.get("eventLimit") ?? url.searchParams.get("event_limit") ?? undefined,
    timeoutMs: url.searchParams.get("timeoutMs") ?? url.searchParams.get("timeout_ms") ?? undefined,
    currency: url.searchParams.get("currency") ?? undefined,
  });
}

async function run(request: Request, input: z.infer<typeof InputSchema>) {
  const allowedTokens = resolveAllowedTokens();
  if (!allowedTokens.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing runner token. Set INTEL_RUN_TOKEN or SCHEDULER_RUN_TOKEN or CRON_SECRET.",
      },
      {
        status: 503,
        headers: noStoreHeaders,
      },
    );
  }

  if (!isAuthorized(request, allowedTokens)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized intel runner token.",
      },
      {
        status: 401,
        headers: noStoreHeaders,
      },
    );
  }

  try {
    const result = await runIntelPipeline({
      force: input.force,
      goodsIds: input.goodsIds,
      providers: input.providers,
      days: input.days,
      eventLimit: input.eventLimit,
      timeoutMs: input.timeoutMs,
      currency: input.currency,
      requestCookie: input.cookie,
      requestCsrfToken: input.csrfToken,
    });
    return NextResponse.json(
      {
        ok: result.ok,
        result,
      },
      {
        status: result.ok ? 200 : 500,
        headers: noStoreHeaders,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown intel run error";
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

export async function GET(request: Request) {
  try {
    const input = parseGetInput(request);
    return run(request, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid intel run query";
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
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const input = InputSchema.parse(body);
    return run(request, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid intel run payload";
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
}
