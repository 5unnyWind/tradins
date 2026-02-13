import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildSchedulerSessionCookie,
  isSchedulerAuthConfigured,
  validateSchedulerPassword,
} from "@/lib/scheduler-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

const LoginSchema = z.object({
  password: z.string().min(1, "密码不能为空"),
});

export async function POST(request: Request) {
  try {
    if (!isSchedulerAuthConfigured()) {
      return NextResponse.json(
        { ok: false, error: "定时任务登录未配置，请设置 SCHEDULER_ADMIN_PASSWORD 与 SCHEDULER_AUTH_SECRET。" },
        { status: 503, headers: noStoreHeaders },
      );
    }

    const body = await request.json();
    const parsed = LoginSchema.parse(body);
    if (!validateSchedulerPassword(parsed.password)) {
      return NextResponse.json(
        { ok: false, error: "密码错误" },
        { status: 401, headers: noStoreHeaders },
      );
    }

    const sessionCookie = buildSchedulerSessionCookie();
    if (!sessionCookie) {
      return NextResponse.json(
        { ok: false, error: "会话签名密钥缺失，请设置 SCHEDULER_AUTH_SECRET。" },
        { status: 500, headers: noStoreHeaders },
      );
    }

    const response = NextResponse.json({ ok: true }, { headers: noStoreHeaders });
    response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "登录失败";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: noStoreHeaders },
    );
  }
}
