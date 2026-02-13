import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizeAnalysisInput } from "@/lib/config";
import { currentStorageMode, saveRecord } from "@/lib/db";
import { resolveFinalRecommendation, runTradinsAnalysis } from "@/lib/engine";
import type { AnalysisRecordMeta } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

const InputSchema = z.object({
  symbol: z
    .string({ required_error: "股票代码不能为空" })
    .trim()
    .min(1, "股票代码不能为空")
    .max(20, "股票代码最长 20 个字符"),
  analysisMode: z.enum(["quick", "standard", "deep"]).optional(),
  debateRounds: z.number().int().min(1).max(10).optional(),
  period: z.string().optional(),
  interval: z.string().optional(),
});

export async function POST(request: Request) {
  let parsed: z.infer<typeof InputSchema>;
  try {
    const body = await request.json();
    parsed = InputSchema.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid analyze payload";
    return NextResponse.json(
      { ok: false, error: message, storage: currentStorageMode() },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const input = normalizeAnalysisInput(parsed);
    const result = await runTradinsAnalysis(input);
    const saved = await saveRecord(input, result);
    const record: AnalysisRecordMeta = {
      id: saved.id,
      symbol: input.symbol,
      analysisMode: input.analysisMode,
      debateRounds: input.debateRounds,
      recommendation: resolveFinalRecommendation(result),
      createdAt: new Date().toISOString(),
    };
    return NextResponse.json(
      {
        ok: true,
        input,
        recordId: saved.id,
        record,
        storage: saved.storage,
        result,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown analyze error";
    return NextResponse.json(
      { ok: false, error: message, storage: currentStorageMode() },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
