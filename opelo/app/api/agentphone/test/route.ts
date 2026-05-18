import { NextRequest, NextResponse } from "next/server";
import { ingestAgentPhoneWebhook } from "@/lib/integrations/agentphone_ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FROM = "+15551234002";
const DEFAULT_BODY =
  "I want your consulting package but my budget is $1,500. Can you do that instead of $3,000?";

/**
 * Inject a fake-but-live SMS so the cockpit can demo the SMS workflow without
 * actually wiring AgentPhone to a webhook. Synthesizes a webhook-shaped
 * payload and runs it through the same parser/ingest path as real webhooks.
 *
 *   curl -X POST http://localhost:3000/api/agentphone/test
 *
 * Optional body fields: from, to, body, source_id.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const messageId =
    (body.source_id as string | undefined) ??
    `ap_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const payload = {
    event: "sms.received",
    data: {
      message: {
        id: messageId,
        from: (body.from as string | undefined) ?? DEFAULT_FROM,
        to:
          (body.to as string | undefined) ??
          process.env.AGENTPHONE_NUMBER ??
          "+15555550100",
        body: (body.body as string | undefined) ?? DEFAULT_BODY,
        received_at: new Date().toISOString(),
      },
    },
  };

  const result = await ingestAgentPhoneWebhook(payload);
  return NextResponse.json({
    ...result,
    test: true,
    payload_used: payload,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "agentphone.test",
    accepts:
      "POST application/json — optional fields: from, to, body, source_id",
    default: {
      from: DEFAULT_FROM,
      body: DEFAULT_BODY,
    },
  });
}
