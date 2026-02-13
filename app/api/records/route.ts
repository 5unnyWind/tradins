import { NextResponse } from "next/server";

import { currentStorageMode, listRecords } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsedLimit = Number(url.searchParams.get("limit") ?? "30");
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(200, Math.floor(parsedLimit))) : 30;
    const parsedCursor = Number(url.searchParams.get("cursor") ?? "0");
    const cursor = Number.isInteger(parsedCursor) && parsedCursor > 0 ? parsedCursor : null;
    const fetched = await listRecords(limit + 1, cursor);
    const records = fetched.slice(0, limit);
    const hasMore = fetched.length > limit;
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
