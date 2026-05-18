import { NextRequest, NextResponse } from "next/server";
import { ingestAgentMailWebhook } from "@/lib/integrations/agentmail_ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLES = [
  {
    from: '"Casey Rivera" <casey@example.com>',
    subject: "Refund for the workshop?",
    text: "Hi! I attended your workshop on Saturday and unfortunately it didn't cover what I was hoping for. Could I get a refund? It was $95.",
  },
  {
    from: '"Brook Lee" <brook@example.com>',
    subject: "Quick pricing question",
    text: "Hey — would you do your consulting package for $1,800 instead of $3,000? It's all I can swing this quarter.",
  },
  {
    from: '"Field Notes Co." <partnerships@fieldnotes.example>',
    subject: "Sponsorship — $1,200 video",
    text: "Hello! We'd love to sponsor your next video for $1,200. 45-second mid-roll, no script approval required.",
  },
];

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const sample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
  const now = new Date().toISOString();
  const messageId =
    (body.message_id as string | undefined) ??
    `am_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Build an AgentMail-shaped payload using whatever the caller provided,
  // falling back to a randomly chosen sample. Wraps in event_type/data so we
  // exercise the same flexible parser the real webhook hits.
  const payload = {
    event_type: "message.received",
    data: {
      message: {
        message_id: messageId,
        from: (body.from as string | undefined) ?? sample.from,
        to:
          (body.to as string | undefined) ??
          "owner@opelo.demo",
        subject: (body.subject as string | undefined) ?? sample.subject,
        text: (body.text as string | undefined) ?? sample.text,
        received_at: now,
        thread_id: (body.thread_id as string | undefined) ?? `thread_${messageId}`,
      },
    },
  };

  const result = await ingestAgentMailWebhook(payload);
  return NextResponse.json({
    ...result,
    test: true,
    payload_used: payload,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "agentmail.test",
    accepts:
      "POST application/json — optional fields: from, to, subject, text, message_id, thread_id",
  });
}
