import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizeAnalysisInput } from "@/lib/config";
import { currentStorageMode, saveRecord } from "@/lib/db";
import { runTradinsAnalysis } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({
  symbol: z.string().min(1).max(20).optional(),
  analysisMode: z.enum(["quick", "standard", "deep"]).optional(),
  debateRounds: z.number().int().min(1).max(10).optional(),
  period: z.string().optional(),
  interval: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = InputSchema.parse(body);
    const input = normalizeAnalysisInput(parsed);
    const result = await runTradinsAnalysis(input);
    const saved = await saveRecord(input, result);
    return NextResponse.json({
      ok: true,
      input,
      recordId: saved.id,
      storage: saved.storage,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown analyze error";
    return NextResponse.json(
      { ok: false, error: message, storage: currentStorageMode() },
      { status: 500 },
    );
  }
}
