import { NextRequest, NextResponse } from "next/server";
import { ingestAgentMailWebhook } from "@/lib/integrations/agentmail_ingest";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function eventTypeOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "agentmail.event";
  const obj = payload as Record<string, unknown>;
  const v = obj.event_type ?? obj.type;
  return typeof v === "string" ? v : "agentmail.event";
}

export async function POST(req: NextRequest) {
  let payload: unknown = {};
  let parseError: string | null = null;
  try {
    payload = await req.json();
  } catch {
    parseError = "invalid_json";
  }

  // Record raw payload first so nothing is ever silently dropped.
  const debugEvent = await store.addWebhookEvent({
    provider: "agentmail",
    event_type: eventTypeOf(payload),
    payload,
    parsed_kind: "unknown",
  });

  if (parseError) {
    return NextResponse.json(
      { ok: false, error: parseError, debug_event_id: debugEvent.id },
      { status: 400 },
    );
  }

  try {
    const result = await ingestAgentMailWebhook(payload);
    await store.updateWebhookEvent(debugEvent.id, {
      parsed_kind: result.inserted ? "email" : "unknown",
      inserted_message_id: result.message?.id,
    });
    return NextResponse.json({ ...result, debug_event_id: debugEvent.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: msg, debug_event_id: debugEvent.id },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "agentmail.webhook",
    accepts: "POST application/json",
  });
}
