import { NextResponse } from "next/server";
import { detectLlmProvider, llmModelName } from "@/lib/ai/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IntegrationStatus {
  key: string;
  label: string;
  mode: "live" | "mock";
  expects: string[];
  present: string[];
  missing: string[];
  note?: string;
}

function check(
  key: string,
  label: string,
  expects: string[],
  note?: string,
): IntegrationStatus {
  const present = expects.filter((v) => !!process.env[v]);
  const missing = expects.filter((v) => !process.env[v]);
  return {
    key,
    label,
    mode: missing.length === 0 ? "live" : "mock",
    expects,
    present,
    missing,
    note,
  };
}

export async function GET() {
  const provider = detectLlmProvider();
  const model = llmModelName(provider);

  const integrations: IntegrationStatus[] = [
    check("sponge", "Sponge — payments / refunds", [
      "SPONGE_API_KEY",
      "SPONGE_BASE_URL",
    ]),
    check("agentphone", "AgentPhone — SMS / calls", [
      "AGENTPHONE_API_KEY",
      "AGENTPHONE_NUMBER",
      "AGENTPHONE_BASE_URL",
    ]),
    check("agentmail", "AgentMail — email replies", [
      "AGENTMAIL_API_KEY",
      "AGENTMAIL_INBOX_ID",
    ]),
    check("supermemory", "Supermemory — company memory", [
      "SUPERMEMORY_API_KEY",
    ]),
    check("calendar", "Google Calendar — bookings", ["GOOGLE_CALENDAR_ID"]),
  ];

  const llmExpected = [
    "GEMINI_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
  ];
  const llm = {
    key: "llm",
    label: "LLM — decision drafting",
    mode: provider ? "live" : "mock",
    provider,
    model,
    expects: llmExpected,
    present: llmExpected.filter((v) => !!process.env[v]),
    note: provider
      ? `Using ${provider} (${model}).`
      : "No LLM key detected — using deterministic engine.",
  };

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    llm,
    integrations,
    summary: {
      live_count:
        integrations.filter((i) => i.mode === "live").length +
        (provider ? 1 : 0),
      total: integrations.length + 1,
    },
  });
}
