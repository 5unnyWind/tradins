import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isSchedulerAuthenticated } from "@/lib/scheduler-auth";
import { runSchedulerTaskById } from "@/lib/scheduler-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

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

export async function POST(_request: Request, context: { params: { id: string } }) {
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
  const result = await runSchedulerTaskById(id, true);
  if (!result) {
    return NextResponse.json(
      { ok: false, error: "任务不存在" },
      { status: 404, headers: noStoreHeaders },
    );
  }
  return NextResponse.json({ ok: true, result }, { headers: noStoreHeaders });
}
