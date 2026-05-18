import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const actions = await store.listActions();
  const customers = await store.listCustomers();
  const messages = await store.listMessages();
  return NextResponse.json({ actions, customers, messages });
}
