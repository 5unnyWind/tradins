import { NextResponse } from "next/server";

import { currentStorageMode, listRecords } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const records = await listRecords(30);
    return NextResponse.json({
      ok: true,
      storage: currentStorageMode(),
      records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown records error";
    return NextResponse.json(
      { ok: false, error: message, storage: currentStorageMode(), records: [] },
      { status: 500 },
    );
  }
}
