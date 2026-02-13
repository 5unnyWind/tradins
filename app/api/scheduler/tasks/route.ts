import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isSchedulerAuthenticated } from "@/lib/scheduler-auth";
import {
  createSchedulerTask,
  currentSchedulerStorageMode,
  listSchedulerTasks,
} from "@/lib/scheduler-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(20),
  analysisMode: z.enum(["quick", "standard", "deep"]).default("standard"),
  debateRounds: z.number().int().min(1).max(10).default(2),
  period: z.string().trim().min(1).max(20).default("6mo"),
  interval: z.string().trim().min(1).max(20).default("1d"),
  intervalMinutes: z.number().int().min(1).max(10080).default(60),
  enabled: z.boolean().default(true),
});

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "未登录或会话已过期" },
    { status: 401, headers: noStoreHeaders },
  );
}

export async function GET() {
  if (!isSchedulerAuthenticated(cookies())) {
    return unauthorized();
  }
  try {
    const tasks = await listSchedulerTasks(500);
    return NextResponse.json(
      {
        ok: true,
        storage: currentSchedulerStorageMode(),
        tasks,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取任务失败";
    return NextResponse.json(
      { ok: false, error: message, tasks: [] },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

export async function POST(request: Request) {
  if (!isSchedulerAuthenticated(cookies())) {
    return unauthorized();
  }
  try {
    const body = await request.json();
    const parsed = CreateSchema.parse(body);
    const created = await createSchedulerTask(parsed);
    return NextResponse.json(
      {
        ok: true,
        storage: currentSchedulerStorageMode(),
        task: created,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建任务失败";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: noStoreHeaders },
    );
  }
}
