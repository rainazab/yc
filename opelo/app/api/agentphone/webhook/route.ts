import { NextRequest, NextResponse } from "next/server";
import { ingestAgentPhoneWebhook } from "@/lib/integrations/agentphone_ingest";
import { store } from "@/lib/db/store";
import { eventTypeOf } from "@/lib/integrations/agentphone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let payload: unknown = {};
  let parseError: string | null = null;
  try {
    payload = await req.json();
  } catch {
    parseError = "invalid_json";
  }

  // Always record the raw payload first so we never silently drop a webhook
  // — even if downstream parsing fails. /api/agentphone/debug reads from here.
  const eventType = eventTypeOf(payload) || "agentphone.event";
  const debugEvent = await store.addWebhookEvent({
    provider: "agentphone",
    event_type: eventType,
    payload,
    parsed_kind: "unknown",
  });

  if (parseError) {
    return NextResponse.json(
      {
        ok: false,
        error: parseError,
        debug_event_id: debugEvent.id,
      },
      { status: 400 },
    );
  }

  try {
    const result = await ingestAgentPhoneWebhook(payload);
    await store.updateWebhookEvent(debugEvent.id, {
      parsed_kind: result.parsed_kind,
      inserted_message_id: result.message?.id,
    });
    return NextResponse.json({ ...result, debug_event_id: debugEvent.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    await store.updateWebhookEvent(debugEvent.id, { parsed_kind: "unknown" });
    return NextResponse.json(
      { ok: false, error: msg, debug_event_id: debugEvent.id },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "agentphone.webhook",
    accepts: "POST application/json",
    debug: "/api/agentphone/debug",
  });
}
