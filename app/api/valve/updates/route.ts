import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchValveOfficialUpdates } from "@/lib/data/valve-updates";

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
  limit: z.coerce.number().int().min(1).max(40).optional().default(12),
  maxLength: z.coerce.number().int().min(120).max(12_000).optional().default(5000),
  includeRss: OptionalBooleanSchema.default(true),
  language: z.string().trim().min(2).max(24).optional().default("english"),
  timeoutMs: z.coerce.number().int().min(500).max(20_000).optional(),
});

function parseGetInput(request: Request): z.infer<typeof InputSchema> {
  const url = new URL(request.url);
  return InputSchema.parse({
    limit: url.searchParams.get("limit") ?? undefined,
    maxLength: url.searchParams.get("maxLength") ?? url.searchParams.get("max_length") ?? undefined,
    includeRss: url.searchParams.get("includeRss") ?? url.searchParams.get("include_rss") ?? undefined,
    language: url.searchParams.get("language") ?? undefined,
    timeoutMs: url.searchParams.get("timeoutMs") ?? url.searchParams.get("timeout_ms") ?? undefined,
  });
}

async function run(input: z.infer<typeof InputSchema>) {
  return fetchValveOfficialUpdates({
    limit: input.limit,
    maxLength: input.maxLength,
    includeRss: input.includeRss,
    language: input.language,
    timeoutMs: input.timeoutMs,
  });
}

export async function GET(request: Request) {
  let input: z.infer<typeof InputSchema>;
  try {
    input = parseGetInput(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Valve updates query";
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
    const message = error instanceof Error ? error.message : "Unknown Valve updates error";
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
    const message = error instanceof Error ? error.message : "Invalid Valve updates payload";
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
    const message = error instanceof Error ? error.message : "Unknown Valve updates error";
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
