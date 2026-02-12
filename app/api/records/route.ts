import { NextResponse } from "next/server";

import { currentStorageMode, listRecords } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsedLimit = Number(url.searchParams.get("limit") ?? "30");
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 30;
    const records = await listRecords(limit);
    return NextResponse.json(
      {
        ok: true,
        storage: currentStorageMode(),
        records,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown records error";
    return NextResponse.json(
      { ok: false, error: message, storage: currentStorageMode(), records: [] },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
