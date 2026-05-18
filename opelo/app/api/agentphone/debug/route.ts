import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns recent AgentPhone webhook payloads exactly as received, along with
 * the parser's verdict (sms / call / unknown) and the inserted message id if
 * any. Use this to debug AgentPhone payload shapes that don't get ingested
 * the way you expect.
 *
 *   curl http://localhost:3000/api/agentphone/debug | jq
 */
export async function GET() {
  const events = await store.listWebhookEvents("agentphone");
  return NextResponse.json({
    ok: true,
    count: events.length,
    events,
  });
}
