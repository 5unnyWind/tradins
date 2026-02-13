import { NextResponse } from "next/server";

import { currentStorageMode, getRecord } from "@/lib/db";

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

export async function GET(
  _request: Request,
  context: { params: { id: string } },
) {
  try {
    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    const record = await getRecord(id);
    if (!record) {
      return NextResponse.json(
        { ok: false, error: "Record not found" },
        { status: 404, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      {
        ok: true,
        storage: currentStorageMode(),
        record,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown record error";
    return NextResponse.json(
      { ok: false, error: message, storage: currentStorageMode() },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
