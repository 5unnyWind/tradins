import { NextResponse } from "next/server";

import { currentStorageMode, getRecord } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      return NextResponse.json({ ok: false, error: "Record not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      storage: currentStorageMode(),
      record,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown record error";
    return NextResponse.json(
      { ok: false, error: message, storage: currentStorageMode() },
      { status: 500 },
    );
  }
}
