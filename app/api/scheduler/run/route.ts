import { NextResponse } from "next/server";

import { runDueSchedulerTasks } from "@/lib/scheduler-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

function resolveAllowedTokens(): string[] {
  const schedulerToken = (process.env.SCHEDULER_RUN_TOKEN ?? "").trim();
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  return [schedulerToken, cronSecret].filter((token) => token.length > 0);
}

function isAuthorized(request: Request, allowedTokens: string[]): boolean {
  if (!allowedTokens.length) return false;
  const headerToken = request.headers.get("x-scheduler-token")?.trim();
  if (headerToken && allowedTokens.includes(headerToken)) return true;
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    if (allowedTokens.includes(bearer)) return true;
  }
  return false;
}

function parseLimit(request: Request): number {
  const url = new URL(request.url);
  const parsedLimit = Number(url.searchParams.get("limit") ?? "3");
  return Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(10, Math.floor(parsedLimit)))
    : 3;
}

async function runScheduler(request: Request) {
  const allowedTokens = resolveAllowedTokens();
  if (!allowedTokens.length) {
    return NextResponse.json(
      { ok: false, error: "Missing scheduler token. Set SCHEDULER_RUN_TOKEN or CRON_SECRET." },
      { status: 503, headers: noStoreHeaders },
    );
  }
  if (!isAuthorized(request, allowedTokens)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized scheduler runner token." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  try {
    const limit = parseLimit(request);
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

export async function GET(request: Request) {
  return runScheduler(request);
}

export async function POST(request: Request) {
  return runScheduler(request);
}
