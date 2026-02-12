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
    const parsedCursor = Number(url.searchParams.get("cursor") ?? "0");
    const cursor = Number.isInteger(parsedCursor) && parsedCursor > 0 ? parsedCursor : null;
    const all = await listRecords(200);
    const filtered = cursor ? all.filter((item) => item.id < cursor) : all;
    const records = filtered.slice(0, limit);
    const hasMore = filtered.length > records.length;
    const nextCursor = hasMore && records.length ? records[records.length - 1]?.id ?? null : null;
    return NextResponse.json(
      {
        ok: true,
        storage: currentStorageMode(),
        records,
        hasMore,
        nextCursor,
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
