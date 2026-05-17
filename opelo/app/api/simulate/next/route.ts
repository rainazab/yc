import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const next = await store.dequeueNextPending();
  const remaining = await store.pendingInboundCount();
  return NextResponse.json({
    ok: true,
    message: next,
    arrived: !!next,
    remaining,
  });
}

export async function GET() {
  const remaining = await store.pendingInboundCount();
  return NextResponse.json({ ok: true, remaining });
}
