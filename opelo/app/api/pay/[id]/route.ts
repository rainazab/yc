import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const link = await store.getPaymentLink(params.id);
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(link);
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  await store.markPaymentLinkPaid(params.id);
  return NextResponse.json({ ok: true });
}
