import { NextRequest, NextResponse } from "next/server";
import { agentphone } from "@/lib/integrations/agentphone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify AgentPhone outbound SMS independently of the pipeline.
 *
 *   curl -X POST http://localhost:3000/api/agentphone/send-test \
 *     -H 'Content-Type: application/json' \
 *     -d '{"to":"+14805483012","body":"Test from Opelo. Reply STOP to unsubscribe."}'
 *
 * Optional fields: agent_id, conversation_id, number_id, source_id.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const text =
    typeof body.body === "string" && body.body.trim()
      ? body.body
      : typeof body.text === "string" && body.text.trim()
        ? body.text
        : "Opelo · AgentPhone test. If you got this, outbound SMS is wired.";
  const source_id =
    typeof body.source_id === "string" ? body.source_id : undefined;
  const agentId =
    typeof body.agent_id === "string"
      ? body.agent_id
      : typeof body.agentId === "string"
        ? body.agentId
        : undefined;
  const conversationId =
    typeof body.conversation_id === "string"
      ? body.conversation_id
      : typeof body.conversationId === "string"
        ? body.conversationId
        : undefined;
  const numberId =
    typeof body.number_id === "string"
      ? body.number_id
      : typeof body.numberId === "string"
        ? body.numberId
        : undefined;

  if (!to) {
    return NextResponse.json(
      { ok: false, error: "`to` is required (E.164 phone number)" },
      { status: 400 },
    );
  }

  const outcome = await agentphone.sendDirectSMS({
    to,
    body: text,
    source_id,
    agentId,
    conversationId,
    numberId,
  });

  return NextResponse.json(
    {
      ok: outcome.ok,
      mode: outcome.mode,
      provider: "agentphone",
      action: outcome.action,
      ref: outcome.ref,
      detail: outcome.detail,
      attempted_endpoints: outcome.attempted_endpoints ?? [],
      hint: outcome.hint,
      env: {
        AGENTPHONE_API_KEY: process.env.AGENTPHONE_API_KEY ? "present" : "missing",
        AGENTPHONE_AGENT_ID: process.env.AGENTPHONE_AGENT_ID ?? null,
        AGENTPHONE_NUMBER_ID: process.env.AGENTPHONE_NUMBER_ID ?? null,
        AGENTPHONE_NUMBER: process.env.AGENTPHONE_NUMBER ?? null,
        AGENTPHONE_BASE_URL:
          process.env.AGENTPHONE_BASE_URL ?? "https://api.agentphone.ai/v1",
        AGENTPHONE_SEND_PATH: process.env.AGENTPHONE_SEND_PATH ?? null,
        AGENTPHONE_FORCE_MOCK_SEND:
          process.env.AGENTPHONE_FORCE_MOCK_SEND ?? "false",
      },
    },
    { status: outcome.ok ? 200 : 502 },
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "agentphone.send-test",
    accepts:
      "POST application/json — fields: to (required), body, agent_id, conversation_id, number_id, source_id",
    env: {
      AGENTPHONE_API_KEY: process.env.AGENTPHONE_API_KEY ? "present" : "missing",
      AGENTPHONE_AGENT_ID: process.env.AGENTPHONE_AGENT_ID ?? null,
      AGENTPHONE_NUMBER_ID: process.env.AGENTPHONE_NUMBER_ID ?? null,
      AGENTPHONE_NUMBER: process.env.AGENTPHONE_NUMBER ?? null,
      AGENTPHONE_BASE_URL:
        process.env.AGENTPHONE_BASE_URL ?? "https://api.agentphone.ai/v1",
      AGENTPHONE_FORCE_MOCK_SEND:
        process.env.AGENTPHONE_FORCE_MOCK_SEND ?? "false",
    },
  });
}
