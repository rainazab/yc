import { NextRequest, NextResponse } from "next/server";
import { ingestAgentPhoneWebhook } from "@/lib/integrations/agentphone_ingest";
import { store } from "@/lib/db/store";
import { handleConversationalMessage } from "@/lib/ai/conversational_handler";
import { ActionRecord } from "@/lib/types";
import { nanoid } from "@/lib/integrations/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FROM = "+15551234001";
const DEFAULT_TRANSCRIPT = "Hi, I run a fast-growing DTC brand and need help building an AI customer support workflow. Budget is around $8k. Are you available next week?";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { body = {}; }

  const sourceId = (body.source_id as string | undefined) ?? `ap_call_test_${Date.now()}`;
  const payload = {
    event: "call.transcribed",
    data: {
      call: {
        id: sourceId,
        from: (body.from as string | undefined) ?? DEFAULT_FROM,
        to: (body.to as string | undefined) ?? process.env.AGENTPHONE_NUMBER ?? "+15555550100",
        transcript: (body.transcript as string | undefined) ?? DEFAULT_TRANSCRIPT,
        caller_name: body.caller_name as string | undefined,
        received_at: new Date().toISOString(),
      },
    },
  };

  const ingest = await ingestAgentPhoneWebhook(payload);
  if (!ingest.inserted || !ingest.message || !ingest.customer) {
    return NextResponse.json({ ...ingest, test: true });
  }

  const message = ingest.message;
  const customer = ingest.customer;
  const policies = await store.getPolicies();
  await store.updateMessageStatus(message.id, "processing");

  const result = await handleConversationalMessage({ message, customer, policies, managerName: "Opelo" });

  const record: ActionRecord = {
    id: nanoid("act"), message_id: message.id, customer_id: customer.id,
    classification: result.classification, decision: result.decision,
    policy_applied: result.policy_applied, reasoning_summary: result.reasoning_summary,
    customer_response: result.customer_response, owner_summary: result.owner_summary,
    action_type: result.action_type, mock_external_actions: result.mock_external_actions,
    revenue_delta: result.revenue_delta, counter_offer: result.counter_offer,
    llm_used: result.llm_used, created_at: new Date().toISOString(),
  };

  await store.addAction(record);
  await store.updateMessageStatus(message.id, "handled");

  return NextResponse.json({
    ok: true, test: true,
    classification: result.classification,
    decision: result.decision,
    action_type: result.action_type,
    owner_summary: result.owner_summary,
    customer_response: result.customer_response,
    llm_used: result.llm_used,
    external_actions: result.mock_external_actions.map(a => ({ name: a.name, ok: a.ok, detail: a.detail })),
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true, endpoint: "agentphone.test-call",
    accepts: "POST — optional: from, to, transcript, caller_name",
    default_transcript: DEFAULT_TRANSCRIPT,
    real_call_flow: "AgentPhone voiceMode=hosted answers verbally → transcript hits /api/agentphone/webhook after call → Opelo processes + owner gets SMS summary with YES/NO action codes",
  });
}
