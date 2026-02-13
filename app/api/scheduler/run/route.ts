import { NextResponse } from "next/server";

import { runDueSchedulerTasks } from "@/lib/scheduler-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

function isAuthorized(request: Request): boolean {
  const requiredToken = (process.env.SCHEDULER_RUN_TOKEN ?? "").trim();
  if (!requiredToken) return false;
  const headerToken = request.headers.get("x-scheduler-token")?.trim();
  if (headerToken && headerToken === requiredToken) return true;
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    if (bearer === requiredToken) return true;
  }
  return false;
}

export async function POST(request: Request) {
  if (!(process.env.SCHEDULER_RUN_TOKEN ?? "").trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing SCHEDULER_RUN_TOKEN." },
      { status: 503, headers: noStoreHeaders },
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized scheduler runner token." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  try {
    const url = new URL(request.url);
    const parsedLimit = Number(url.searchParams.get("limit") ?? "3");
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(10, Math.floor(parsedLimit)))
      : 3;
    const results = await runDueSchedulerTasks(limit);
    return NextResponse.json(
      { ok: true, count: results.length, results },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scheduler run error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
