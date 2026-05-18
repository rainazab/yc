import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const wallet = await store.getWallet();
  return NextResponse.json({ wallet });
}
