import { NextRequest, NextResponse } from "next/server";
import { agentmail } from "@/lib/integrations/agentmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manually verify AgentMail sending. Provide `to`, `subject`, `text` (and
 * optionally `source_id` to reply in-thread to a known AgentMail message).
 *
 *   curl -X POST http://localhost:3000/api/agentmail/send-test \
 *     -H 'Content-Type: application/json' \
 *     -d '{"to":"you@gmail.com","subject":"Opelo test","text":"Hi from Opelo"}'
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject =
    typeof body.subject === "string" && body.subject.trim()
      ? body.subject
      : "Opelo · AgentMail test";
  const text =
    typeof body.text === "string" && body.text.trim()
      ? body.text
      : "This is a test from Opelo. If you're reading this in your inbox, AgentMail is wired up correctly.";
  const source_id =
    typeof body.source_id === "string" ? body.source_id : undefined;

  if (!to) {
    return NextResponse.json(
      { ok: false, error: "`to` is required (recipient email address)" },
      { status: 400 },
    );
  }

  const outcome = await agentmail.sendDirect({ to, subject, text, source_id });

  return NextResponse.json(
    {
      ok: outcome.ok,
      log: outcome.log,
      ref: outcome.ref,
      detail: outcome.detail,
      env: {
        AGENTMAIL_API_KEY: process.env.AGENTMAIL_API_KEY ? "present" : "missing",
        AGENTMAIL_INBOX_ID: process.env.AGENTMAIL_INBOX_ID ?? null,
        AGENTMAIL_BASE_URL:
          process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0",
      },
    },
    { status: outcome.ok ? 200 : 502 },
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "agentmail.send-test",
    accepts:
      "POST application/json — fields: to (required), subject, text, source_id",
    env: {
      AGENTMAIL_API_KEY: process.env.AGENTMAIL_API_KEY ? "present" : "missing",
      AGENTMAIL_INBOX_ID: process.env.AGENTMAIL_INBOX_ID ?? null,
      AGENTMAIL_BASE_URL:
        process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0",
    },
  });
}
