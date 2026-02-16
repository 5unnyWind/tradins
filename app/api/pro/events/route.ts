import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchProPlayerEvents } from "@/lib/data/pro-events";

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
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  if (typeof value === "number") return value === 1;
  return undefined;
}, z.boolean().optional());

const InputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(40).optional().default(16),
  includeLiquipedia: OptionalBooleanSchema.default(true),
  timeoutMs: z.coerce.number().int().min(500).max(20_000).optional(),
});

function parseGetInput(request: Request): z.infer<typeof InputSchema> {
  const url = new URL(request.url);
  return InputSchema.parse({
    limit: url.searchParams.get("limit") ?? undefined,
    includeLiquipedia:
      url.searchParams.get("includeLiquipedia") ?? url.searchParams.get("include_liquipedia") ?? undefined,
    timeoutMs: url.searchParams.get("timeoutMs") ?? url.searchParams.get("timeout_ms") ?? undefined,
  });
}

async function run(input: z.infer<typeof InputSchema>) {
  return fetchProPlayerEvents({
    limit: input.limit,
    includeLiquipedia: input.includeLiquipedia,
    timeoutMs: input.timeoutMs,
  });
}

export async function GET(request: Request) {
  let input: z.infer<typeof InputSchema>;
  try {
    input = parseGetInput(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid pro events query";
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
    const message = error instanceof Error ? error.message : "Unknown pro events error";
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
    const message = error instanceof Error ? error.message : "Invalid pro events payload";
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
    const message = error instanceof Error ? error.message : "Unknown pro events error";
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
