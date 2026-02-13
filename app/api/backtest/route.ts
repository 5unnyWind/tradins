import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizeBacktestSymbol, runBacktest } from "@/lib/backtest";

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
  lookbackDays: z.coerce.number().int().min(30).max(3650).default(365),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.parse({
      symbol: url.searchParams.get("symbol") ?? "",
      lookbackDays: url.searchParams.get("lookbackDays") ?? "365",
    });

    const symbol = normalizeBacktestSymbol(parsed.symbol);
    const report = await runBacktest({
      symbol,
      lookbackDays: parsed.lookbackDays,
    });

    return NextResponse.json(
      {
        ok: true,
        report,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backtest error";
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
