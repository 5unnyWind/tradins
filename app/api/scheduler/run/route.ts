import { NextResponse } from "next/server";

import { runIntelPipeline } from "@/lib/intel-runner";
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

function parseBooleanParam(request: Request, key: string, fallback: boolean): boolean {
  const url = new URL(request.url);
  const raw = url.searchParams.get(key);
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
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
    const runIntel = parseBooleanParam(request, "runIntel", true);
    const intelForce = parseBooleanParam(request, "intelForce", false);
    const results = await runDueSchedulerTasks(limit);
    const intelResult = runIntel ? await runIntelPipeline({ force: intelForce }) : null;
    const ok = intelResult ? intelResult.ok : true;
    return NextResponse.json(
      { ok, count: results.length, results, intel: intelResult },
      { status: ok ? 200 : 500, headers: noStoreHeaders },
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
