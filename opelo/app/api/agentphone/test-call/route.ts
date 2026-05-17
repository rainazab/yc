import { NextRequest, NextResponse } from "next/server";
import { ingestAgentPhoneWebhook } from "@/lib/integrations/agentphone_ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FROM = "+15551234001";
const DEFAULT_TRANSCRIPT =
  "Hi, I run a fast-growing DTC brand and need help building an AI customer support workflow. Budget is around $8k. Are you available next week?";

/**
 * Inject a fake-but-live call transcript so the cockpit can demo the
 * phone_transcript workflow without an actual AgentPhone call landing.
 * Builds a call.transcribed-shaped payload and routes it through the
 * production ingest path.
 *
 *   curl -X POST http://localhost:3000/api/agentphone/test-call
 *
 * Optional body fields: from, to, transcript, source_id, caller_name.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const sourceId =
    (body.source_id as string | undefined) ?? `ap_call_test_${Date.now()}`;

  const payload = {
    event: "call.transcribed",
    data: {
      call: {
        id: sourceId,
        from: (body.from as string | undefined) ?? DEFAULT_FROM,
        to:
          (body.to as string | undefined) ??
          process.env.AGENTPHONE_NUMBER ??
          "+15555550100",
        transcript:
          (body.transcript as string | undefined) ?? DEFAULT_TRANSCRIPT,
        caller_name: body.caller_name as string | undefined,
        received_at: new Date().toISOString(),
      },
    },
  };

  const result = await ingestAgentPhoneWebhook(payload);
  return NextResponse.json({ ...result, test: true, payload_used: payload });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "agentphone.test-call",
    accepts:
      "POST application/json — optional fields: from, to, transcript, source_id, caller_name",
    default: {
      from: DEFAULT_FROM,
      transcript: DEFAULT_TRANSCRIPT,
    },
  });
}
