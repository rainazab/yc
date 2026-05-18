/**
 * Conversation history fetcher for multi-turn AI responses.
 *
 * Pulls previous messages from AgentPhone so Gemini has full context
 * before deciding whether to keep chatting or take a business action.
 */
import type { ConversationTurn } from "./gemini";

const BASE = process.env.AGENTPHONE_BASE_URL ?? "https://api.agentphone.ai/v1";
const KEY  = process.env.AGENTPHONE_API_KEY ?? "";

interface ApMsg {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  receivedAt: string;
}

/**
 * Fetch the last N messages from an AgentPhone conversation
 * and map them to Gemini-compatible conversation turns.
 *
 * Inbound  → role: "user"
 * Outbound → role: "model"  (what Opelo previously replied)
 */
export async function fetchConversationHistory(
  conversationId: string,
  limit = 10,
): Promise<ConversationTurn[]> {
  if (!KEY || !conversationId) return [];

  try {
    const resp = await fetch(
      `${BASE}/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`,
      { headers: { Authorization: `Bearer ${KEY}` } },
    );
    if (!resp.ok) return [];

    const data = await resp.json() as { data?: ApMsg[] };
    const messages = (data.data ?? [])
      .filter(m => m.body?.trim())
      .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

    return messages.map(m => ({
      role: m.direction === "inbound" ? "user" : "model",
      text: m.body.trim(),
    }));
  } catch {
    return [];
  }
}

/** Build a plain-text policies summary for the conversational system prompt. */
export function buildPoliciesSummary(policies: {
  refund_auto_approve_under: number;
  min_sponsorship_price: number;
  min_project_price: number;
  auto_book_lead_above: number;
  vip_customers: string[];
  escalation_keywords: string[];
}): string {
  return [
    `- Auto-approve refunds under $${policies.refund_auto_approve_under}`,
    `- Auto-book leads with budget above $${policies.auto_book_lead_above}`,
    `- Minimum sponsorship price: $${policies.min_sponsorship_price}`,
    `- Minimum project price: $${policies.min_project_price}`,
    policies.vip_customers.length
      ? `- VIP clients (escalate before rejecting): ${policies.vip_customers.join(", ")}`
      : null,
    policies.escalation_keywords.length
      ? `- Escalate if message contains: ${policies.escalation_keywords.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}
