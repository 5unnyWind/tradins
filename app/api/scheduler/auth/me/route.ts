import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isSchedulerAuthConfigured, isSchedulerAuthenticated } from "@/lib/scheduler-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function GET() {
  const cookieStore = cookies();
  const configured = isSchedulerAuthConfigured();
  const authenticated = configured ? isSchedulerAuthenticated(cookieStore) : false;
  return NextResponse.json(
    {
      ok: true,
      configured,
      authenticated,
    },
    { headers: noStoreHeaders },
  );
}
