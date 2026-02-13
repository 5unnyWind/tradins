import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isSchedulerAuthenticated } from "@/lib/scheduler-auth";
import {
  deleteSchedulerTask,
  getSchedulerTask,
  updateSchedulerTask,
} from "@/lib/scheduler-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    symbol: z.string().trim().min(1).max(20).optional(),
    analysisMode: z.enum(["quick", "standard", "deep"]).optional(),
    debateRounds: z.number().int().min(1).max(10).optional(),
    period: z.string().trim().min(1).max(20).optional(),
    interval: z.string().trim().min(1).max(20).optional(),
    intervalMinutes: z.number().int().min(1).max(10080).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少传入一个要更新的字段",
  });

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "未登录或会话已过期" },
    { status: 401, headers: noStoreHeaders },
  );
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: { params: { id: string } }) {
  if (!isSchedulerAuthenticated(cookies())) {
    return unauthorized();
  }
  const id = parseId(context.params.id);
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "任务 ID 非法" },
      { status: 400, headers: noStoreHeaders },
    );
  }
  const task = await getSchedulerTask(id);
  if (!task) {
    return NextResponse.json(
      { ok: false, error: "任务不存在" },
      { status: 404, headers: noStoreHeaders },
    );
  }
  return NextResponse.json({ ok: true, task }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  if (!isSchedulerAuthenticated(cookies())) {
    return unauthorized();
  }
  try {
    const id = parseId(context.params.id);
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "任务 ID 非法" },
        { status: 400, headers: noStoreHeaders },
      );
    }
    const body = await request.json();
    const patch = PatchSchema.parse(body);
    const task = await updateSchedulerTask(id, patch);
    if (!task) {
      return NextResponse.json(
        { ok: false, error: "任务不存在" },
        { status: 404, headers: noStoreHeaders },
      );
    }
    return NextResponse.json({ ok: true, task }, { headers: noStoreHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新任务失败";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: noStoreHeaders },
    );
  }
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  if (!isSchedulerAuthenticated(cookies())) {
    return unauthorized();
  }
  const id = parseId(context.params.id);
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "任务 ID 非法" },
      { status: 400, headers: noStoreHeaders },
    );
  }
  const deleted = await deleteSchedulerTask(id);
  if (!deleted) {
    return NextResponse.json(
      { ok: false, error: "任务不存在" },
      { status: 404, headers: noStoreHeaders },
    );
  }
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
}
