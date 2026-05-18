import { NextRequest, NextResponse } from "next/server";
import { getPolicies, savePolicies } from "@/lib/policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const p = await getPolicies();
  return NextResponse.json(p);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const updated = await savePolicies(body);
  return NextResponse.json(updated);
}
