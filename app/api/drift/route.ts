import { NextResponse } from "next/server";
import { z } from "zod";

import { runConclusionDrift } from "@/lib/drift";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

const QuerySchema = z.object({
  symbol: z
    .string({ required_error: "symbol is required" })
    .trim()
    .min(1, "symbol is required")
    .max(20, "symbol max length is 20"),
  limit: z.coerce.number().int().min(5).max(300).default(60),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.parse({
      symbol: url.searchParams.get("symbol") ?? "",
      limit: url.searchParams.get("limit") ?? "60",
    });

    const report = await runConclusionDrift({
      symbol: parsed.symbol,
      limit: parsed.limit,
    });

    return NextResponse.json(
      {
        ok: true,
        report,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown drift error";
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
