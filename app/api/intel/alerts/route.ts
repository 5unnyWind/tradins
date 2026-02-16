import { NextResponse } from "next/server";
import { z } from "zod";

import { buildIntelAlertsReport, intelStorageMode } from "@/lib/intel-db";

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

const InputSchema = z.object({
  lookbackHours: z.coerce.number().int().min(1).max(24 * 30).optional().default(48),
  goodsId: z.coerce.number().int().min(1).max(1_000_000_000).optional(),
  impactScoreThreshold: z.coerce.number().min(0.1).max(100).optional(),
  return24AbsThreshold: z.coerce.number().min(0.1).max(1000).optional(),
  relevanceScoreThreshold: z.coerce.number().min(0).max(1).optional(),
});

function parseGetInput(request: Request): z.infer<typeof InputSchema> {
  const url = new URL(request.url);
  return InputSchema.parse({
    lookbackHours: url.searchParams.get("lookbackHours") ?? url.searchParams.get("lookback_hours") ?? undefined,
    goodsId: url.searchParams.get("goodsId") ?? url.searchParams.get("goods_id") ?? undefined,
    impactScoreThreshold:
      url.searchParams.get("impactScoreThreshold") ??
      url.searchParams.get("impact_score_threshold") ??
      undefined,
    return24AbsThreshold:
      url.searchParams.get("return24AbsThreshold") ??
      url.searchParams.get("return_24_abs_threshold") ??
      undefined,
    relevanceScoreThreshold:
      url.searchParams.get("relevanceScoreThreshold") ??
      url.searchParams.get("relevance_score_threshold") ??
      undefined,
  });
}

async function run(input: z.infer<typeof InputSchema>) {
  const report = await buildIntelAlertsReport({
    lookbackHours: input.lookbackHours,
    goodsId: input.goodsId,
    impactScoreThreshold: input.impactScoreThreshold,
    return24AbsThreshold: input.return24AbsThreshold,
    relevanceScoreThreshold: input.relevanceScoreThreshold,
  });
  return {
    storage: intelStorageMode(),
    report,
  };
}

export async function GET(request: Request) {
  let input: z.infer<typeof InputSchema>;
  try {
    input = parseGetInput(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid intel alerts query";
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
    const message = error instanceof Error ? error.message : "Unknown intel alerts error";
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
    const message = error instanceof Error ? error.message : "Invalid intel alerts payload";
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
    const message = error instanceof Error ? error.message : "Unknown intel alerts error";
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
