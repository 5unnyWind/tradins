import { NextResponse } from "next/server";

import { getSourceHealthSnapshot, resetSourceHealthSnapshot } from "@/lib/source-health";

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

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      snapshot: getSourceHealthSnapshot(),
    },
    { headers: noStoreHeaders },
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "";

  if (action === "reset") {
    resetSourceHealthSnapshot();
    return NextResponse.json(
      {
        ok: true,
        snapshot: getSourceHealthSnapshot(),
      },
      { headers: noStoreHeaders },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Unsupported action",
    },
    {
      status: 400,
      headers: noStoreHeaders,
    },
  );
}
