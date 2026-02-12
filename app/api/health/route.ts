import { NextResponse } from "next/server";

import { currentStorageMode } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "ok",
    storage: currentStorageMode(),
    now: new Date().toISOString(),
  });
}
