import { Classification, Decision } from "../types";

export interface GeminiInput {
  managerName: string;
  classification: Classification;
  decision: Decision;
  policy_applied: string;
  detected_amount?: number;
  customer_name: string;
  customer_email: string;
  is_vip: boolean;
  message_body: string;
  next_slot_label?: string;
  business_name: string;
  owner_name: string;
}

export interface GeminiDecisionResponse {
  classification: string;
  reasoning_summary: string;
  decision: string;
  policy_applied: string;
  customer_response: string;
  owner_summary: string;
  action_type: string;
  suggested_external_actions: string[];
}

const SYSTEM_INSTRUCTION = `You are an AI operations manager for a one-person business. You make practical business decisions based on explicit owner policies. You do not merely draft replies; you decide what should happen, choose the relevant policy, generate a customer response, and summarize the owner update. Never expose chain-of-thought. Reasoning_summary must be one short business sentence — not a step-by-step trace. Return only valid JSON.

LANGUAGE: Detect the language of the inbound message and write customer_response in THAT SAME LANGUAGE. If the message is in Spanish, reply in Spanish. If French, reply in French. If Portuguese, reply in Portuguese. Owner summaries and reasoning_summary stay in English.`;

// ─── Conversational (multi-turn) types ───────────────────────────────────────

export interface ConversationTurn {
  role: "user" | "model";
  text: string;
}

export interface ConversationalInput {
  businessName: string;
  businessDescription: string;
  policiesSummary: string;
  managerName: string;
  history: ConversationTurn[];   // previous turns, oldest first
  latestMessage: string;          // the new customer message
  customerName?: string;
}

export interface ConversationalResponse {
  /** "chat" = keep talking; "action" = classify + execute */
  mode: "chat" | "action";
  chat_reply?: string;
  customer_response: string;      // final reply to send (used in both modes)
  // action-mode fields
  classification?: string;
  decision?: string;
  action_type?: string;
  policy_applied?: string;
  owner_summary?: string;
  reasoning_summary?: string;
}

const CONVERSATIONAL_SYSTEM = `You are an AI operations manager named {MANAGER} working for {BUSINESS}.

About the business: {DESCRIPTION}

Business rules you follow:
{POLICIES}

Your job is to have natural, warm conversations with customers AND make business decisions when appropriate.

When to keep chatting (mode="chat"):
- Greetings, small talk, or vague openers ("Hi", "Hey", "I have a question")
- You need more info to act (ask 1 clear question max)
- Customer is still describing their situation

When to act (mode="action"):
- Refund request with an amount mentioned
- Someone asking about pricing / budget
- Sponsorship offer with a price
- Lead wanting to book or schedule something
- Complaint or escalation language

LANGUAGE: Always reply in the customer's language. Detect it from their messages.

Return ONLY valid JSON — no prose outside the JSON:
{
  "mode": "chat" | "action",
  "chat_reply": "warm, natural reply if mode=chat (1-2 sentences, no jargon)",
  "customer_response": "the message to send to the customer (required, same as chat_reply when mode=chat)",
  "classification": "refund_request|pricing_exception|sponsorship_offer|qualified_lead|scheduling_request|escalation (only if mode=action)",
  "decision": "approve|reject|negotiate|schedule|escalate_to_owner (only if mode=action)",
  "action_type": "refund_issued|discount_offered|sponsorship_countered|meeting_booked|owner_escalated|auto_reply_sent (only if mode=action)",
  "policy_applied": "short policy label (only if mode=action)",
  "owner_summary": "one sentence for owner (only if mode=action)",
  "reasoning_summary": "one short business sentence (only if mode=action)"
}`;

/**
 * Multi-turn conversational call — passes full conversation history to Gemini
 * so it can ask follow-up questions and respond naturally before acting.
 */
export async function callGeminiConversational(
  input: ConversationalInput,
): Promise<ConversationalResponse | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const model = geminiModelName();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const systemText = CONVERSATIONAL_SYSTEM
    .replace("{MANAGER}", input.managerName)
    .replace("{BUSINESS}", input.businessName)
    .replace("{DESCRIPTION}", input.businessDescription || "A small business")
    .replace("{POLICIES}", input.policiesSummary);

  // Build multi-turn contents array
  const contents = [
    ...input.history.map(t => ({
      role: t.role,
      parts: [{ text: t.text }],
    })),
    { role: "user" as const, parts: [{ text: input.latestMessage }] },
  ];

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: { temperature: 0.6, responseMimeType: "application/json" },
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseConversational(text);
  } catch {
    return null;
  }
}

function parseConversational(text: string): ConversationalResponse | null {
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const p = JSON.parse(text.slice(start, end + 1)) as Partial<ConversationalResponse>;
    if (!p.customer_response && !p.chat_reply) return null;
    return {
      mode:               (p.mode === "action" ? "action" : "chat") as "chat" | "action",
      chat_reply:         p.chat_reply,
      customer_response:  String(p.customer_response || p.chat_reply || ""),
      classification:     p.classification,
      decision:           p.decision,
      action_type:        p.action_type,
      policy_applied:     p.policy_applied,
      owner_summary:      p.owner_summary,
      reasoning_summary:  p.reasoning_summary,
    };
  } catch {
    return null;
  }
}

export function isGeminiAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function geminiModelName(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

export async function callGemini(
  input: GeminiInput,
): Promise<GeminiDecisionResponse | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = geminiModelName();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const prompt = buildPrompt(input);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
      }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseDecision(text);
  } catch {
    return null;
  }
}

function buildPrompt(input: GeminiInput): string {
  const isRefundApprove =
    input.classification === "refund_request" && input.decision === "approve";

  const guardrails: string[] = [];
  if (isRefundApprove) {
    const amt = input.detected_amount
      ? `$${input.detected_amount.toFixed(2)}`
      : "the requested amount";
    guardrails.push(
      `CRITICAL: this is a refund approval. The customer_response MUST explicitly state that the refund has been BOTH approved AND processed (the money has been moved), include the dollar amount (${amt}), and set timing expectations (e.g. "within a few business days"). Do not merely say "approved" — the customer's card has been credited.`,
    );
  }
  if (input.decision === "negotiate") {
    guardrails.push(
      `For negotiations, the customer_response should propose the counter-offer warmly and make next steps clear.`,
    );
  }
  if (input.decision === "schedule") {
    guardrails.push(
      `For scheduling, the customer_response should reference the booked time or available windows so the customer can act immediately.`,
    );
  }

  return `Business: ${input.business_name} (owner: ${input.owner_name}). You are "${input.managerName}", the AI operations manager.

Decision context (already classified by deterministic engine — refine if clearly wrong, otherwise keep):
- classification: ${input.classification}
- decision: ${input.decision}
- policy_applied: ${input.policy_applied}
- detected_amount: ${input.detected_amount ?? "n/a"}
- customer: ${input.customer_name} <${input.customer_email}>${input.is_vip ? " [VIP]" : ""}
- proposed_slot: ${input.next_slot_label ?? "n/a"}

Inbound message:
"""
${input.message_body}
"""

Return ONLY a JSON object matching this exact schema:
{
  "classification": "refund_request|pricing_exception|sponsorship_offer|qualified_lead|scheduling_request|escalation",
  "reasoning_summary": "one short business sentence, no chain-of-thought",
  "decision": "approve|reject|negotiate|schedule|escalate_to_owner",
  "policy_applied": "short policy label that justified the decision",
  "customer_response": "2-4 short sentences, warm + professional, signed from the owner (not the AI)",
  "owner_summary": "one sentence the owner can read at a glance",
  "action_type": "refund_issued|discount_offered|sponsorship_declined|sponsorship_countered|meeting_booked|owner_escalated|lead_nurtured|auto_reply_sent",
  "suggested_external_actions": ["sponge.refund.created", "agentmail.reply", "agentphone.sms.owner_update"]
}

${guardrails.length ? "Guardrails:\n- " + guardrails.join("\n- ") : ""}`.trim();
}

function parseDecision(text: string): GeminiDecisionResponse | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<GeminiDecisionResponse>;
    if (
      typeof parsed.classification !== "string" ||
      typeof parsed.decision !== "string" ||
      typeof parsed.customer_response !== "string"
    ) {
      return null;
    }
    return {
      classification: String(parsed.classification),
      reasoning_summary: String(parsed.reasoning_summary ?? "").slice(0, 400),
      decision: String(parsed.decision),
      policy_applied: String(parsed.policy_applied ?? "").slice(0, 280),
      customer_response: String(parsed.customer_response).slice(0, 1500),
      owner_summary: String(parsed.owner_summary ?? "").slice(0, 280),
      action_type: String(parsed.action_type ?? "auto_reply_sent"),
      suggested_external_actions: Array.isArray(parsed.suggested_external_actions)
        ? parsed.suggested_external_actions.slice(0, 10).map(String)
        : [],
    };
  } catch {
    return null;
  }
}
