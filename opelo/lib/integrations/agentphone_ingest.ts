import { Customer, InboundMessage } from "../types";
import { store } from "../db/store";
import {
  ParsedCall,
  ParsedSMS,
  eventTypeOf,
  lookupConversationIdForPhone,
  normalizeInboundCall,
  normalizeInboundSMS,
} from "./agentphone";

export interface AgentPhoneIngestResult {
  ok: boolean;
  inserted: boolean;
  parsed_kind: "sms" | "call" | "unknown";
  reason?: string;
  message?: InboundMessage;
  customer?: Customer;
  event_type?: string;
}

/**
 * Top-level ingest for any AgentPhone webhook payload. Try SMS shape first,
 * then call/transcript shape. Unknown payloads are returned as such so the
 * webhook route can still record them in the debug feed.
 */
export async function ingestAgentPhoneWebhook(
  payload: unknown,
): Promise<AgentPhoneIngestResult> {
  const event_type = eventTypeOf(payload) || "agentphone.event";

  const sms = normalizeInboundSMS(payload);
  if (sms) {
    return ingestSMS(sms, event_type);
  }

  const call = normalizeInboundCall(payload);
  if (call) {
    return ingestCall(call, event_type);
  }

  return {
    ok: false,
    inserted: false,
    parsed_kind: "unknown",
    reason: "could_not_parse_payload",
    event_type,
  };
}

async function ingestSMS(
  parsed: ParsedSMS,
  event_type: string,
): Promise<AgentPhoneIngestResult> {
  const phoneSlug = slug(parsed.from) || `unknown_${Date.now()}`;
  const customerId = `cus_live_${phoneSlug}`;

  const customer: Customer = {
    id: customerId,
    name: friendlyName(parsed.from),
    email: "",
    phone: parsed.from,
    vip: false,
    prior_refunds: 0,
    lifetime_value: 0,
    created_at: new Date().toISOString(),
  };
  await store.upsertCustomer(customer);

  // If AgentPhone's webhook didn't include a conversation_id, look it up so
  // replies to shared-imessage lines don't get a 403 (that field is required).
  let conversationId = parsed.conversationId;
  if (!conversationId) {
    conversationId = await lookupConversationIdForPhone(parsed.from);
  }

  const messageId = `msg_ap_${slug(parsed.source_id)}`;
  const agentId   = parsed.agentId   ?? process.env.AGENTPHONE_AGENT_ID?.trim();
  const numberId  = parsed.numberId  ?? process.env.AGENTPHONE_NUMBER_ID?.trim();
  const hasAgentphoneMeta = agentId || conversationId || numberId || parsed.channel;
  const message: InboundMessage = {
    id: messageId,
    customer_id: customerId,
    channel: "sms",
    subject:
      parsed.channel === "imessage"
        ? `iMessage from ${parsed.from}`
        : `SMS from ${parsed.from}`,
    body: parsed.body,
    received_at: parsed.received_at,
    status: "new",
    amount_hint: detectAmount(parsed.body),
    source_id: parsed.source_id,
    metadata: hasAgentphoneMeta
      ? {
          agentphone: {
            agentId,
            conversationId,
            numberId,
            channel: parsed.channel,
          },
        }
      : undefined,
  };
  const { inserted, message: stored } = await store.addMessage(message);

  return {
    ok: true,
    inserted,
    parsed_kind: "sms",
    reason: inserted ? "inserted" : "duplicate",
    message: stored,
    customer,
    event_type: parsed.event_type || event_type,
  };
}

async function ingestCall(
  parsed: ParsedCall,
  event_type: string,
): Promise<AgentPhoneIngestResult> {
  const phoneSlug = slug(parsed.from) || `unknown_${Date.now()}`;
  const customerId = `cus_live_call_${phoneSlug}`;
  const displayName = parsed.caller_name?.trim() || friendlyName(parsed.from);

  const customer: Customer = {
    id: customerId,
    name: displayName,
    email: "",
    phone: parsed.from,
    vip: false,
    prior_refunds: 0,
    lifetime_value: 0,
    created_at: new Date().toISOString(),
  };
  await store.upsertCustomer(customer);

  const messageId = `msg_apcall_${slug(parsed.source_id)}`;
  const message: InboundMessage = {
    id: messageId,
    customer_id: customerId,
    channel: "phone_transcript",
    subject: `Call transcript from ${displayName}`,
    body: parsed.transcript,
    received_at: parsed.received_at,
    status: "new",
    amount_hint: detectAmount(parsed.transcript),
    source_id: parsed.source_id,
  };
  const { inserted, message: stored } = await store.addMessage(message);

  return {
    ok: true,
    inserted,
    parsed_kind: "call",
    reason: inserted ? "inserted" : "duplicate",
    message: stored,
    customer,
    event_type: parsed.event_type || event_type,
  };
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9_+-]+/g, "_").slice(0, 80);
}

function friendlyName(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function detectAmount(text: string): number | undefined {
  // Prefer the FIRST dollar amount — in negotiation-shaped messages people
  // lead with their budget.
  const matches = Array.from(
    text.matchAll(/\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)(\s?[kK])?/g),
  );
  for (const m of matches) {
    const raw = m[1].replace(/,/g, "");
    let n = parseFloat(raw);
    if (m[2]) n *= 1000;
    if (Number.isFinite(n)) return n;
  }
  const kMatch = text.match(/\b([0-9]+(?:\.[0-9]+)?)\s?k\b/i);
  if (kMatch) return parseFloat(kMatch[1]) * 1000;
  return undefined;
}
