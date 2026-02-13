import { NextResponse } from "next/server";

import { clearSchedulerSessionCookie } from "@/lib/scheduler-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: noStoreHeaders });
  const cookie = clearSchedulerSessionCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
