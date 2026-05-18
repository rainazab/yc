import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const messages = await store.listMessages();
  const customers = await store.listCustomers();
  return NextResponse.json({ messages, customers });
}
