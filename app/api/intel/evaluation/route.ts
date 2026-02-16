import { NextResponse } from "next/server";
import { z } from "zod";

import { buildIntelEvaluationReport, intelStorageMode } from "@/lib/intel-db";

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
  lookbackDays: z.coerce.number().int().min(1).max(3650).optional().default(60),
  goodsId: z.coerce.number().int().min(1).max(1_000_000_000).optional(),
});

function parseGetInput(request: Request): z.infer<typeof InputSchema> {
  const url = new URL(request.url);
  return InputSchema.parse({
    lookbackDays: url.searchParams.get("lookbackDays") ?? url.searchParams.get("lookback_days") ?? undefined,
    goodsId: url.searchParams.get("goodsId") ?? url.searchParams.get("goods_id") ?? undefined,
  });
}

async function run(input: z.infer<typeof InputSchema>) {
  const report = await buildIntelEvaluationReport({
    lookbackDays: input.lookbackDays,
    goodsId: input.goodsId,
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
    const message = error instanceof Error ? error.message : "Invalid intel evaluation query";
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
    const message = error instanceof Error ? error.message : "Unknown intel evaluation error";
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
    const message = error instanceof Error ? error.message : "Invalid intel evaluation payload";
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
    const message = error instanceof Error ? error.message : "Unknown intel evaluation error";
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
