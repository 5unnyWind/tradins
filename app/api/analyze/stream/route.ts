import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizeAnalysisInput } from "@/lib/config";
import { currentStorageMode, saveRecord } from "@/lib/db";
import { extractRecommendation, runTradinsAnalysis } from "@/lib/engine";
import type { AnalysisRecordMeta } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({
  symbol: z.string().min(1).max(20).optional(),
  analysisMode: z.enum(["quick", "standard", "deep"]).optional(),
  debateRounds: z.number().int().min(1).max(10).optional(),
  period: z.string().optional(),
  interval: z.string().optional(),
});

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

const sseHeaders = {
  ...noStoreHeaders,
  "Content-Type": "text/event-stream; charset=utf-8",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function toSseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  let input: ReturnType<typeof normalizeAnalysisInput>;
  try {
    const body = await request.json();
    const parsed = InputSchema.parse(body);
    input = normalizeAnalysisInput(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid analyze payload";
    return NextResponse.json(
      { ok: false, error: message, storage: currentStorageMode() },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(toSseFrame(event, data)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      const heartbeat = setInterval(() => {
        send("ping", { now: new Date().toISOString() });
      }, 15000);

      void (async () => {
        try {
          send("status", { message: "请求已接收，开始多智能体分析..." });
          const result = await runTradinsAnalysis(input, (event) => {
            if (event.type === "progress") {
              send("progress", event);
              return;
            }
            send("artifact", event);
          });

          send("status", { message: "分析完成，正在保存记录..." });
          const saved = await saveRecord(input, result);
          const record: AnalysisRecordMeta = {
            id: saved.id,
            symbol: input.symbol,
            analysisMode: input.analysisMode,
            debateRounds: input.debateRounds,
            recommendation: extractRecommendation(result.riskReports.judge),
            createdAt: new Date().toISOString(),
          };

          send("done", {
            ok: true,
            input,
            recordId: saved.id,
            record,
            storage: saved.storage,
            result,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown analyze error";
          send("error", { ok: false, error: message, storage: currentStorageMode() });
        } finally {
          clearInterval(heartbeat);
          send("end", { done: true });
          close();
        }
      })();
    },
    cancel() {},
  });

  return new Response(stream, { headers: sseHeaders });
}
