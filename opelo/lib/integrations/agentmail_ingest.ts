import { Customer, InboundMessage } from "../types";
import { store } from "../db/store";

export interface IngestResult {
  ok: boolean;
  inserted: boolean;
  reason?: string;
  message?: InboundMessage;
  customer?: Customer;
  event_type?: string;
}

/**
 * Parse a raw AgentMail webhook payload into an InboundMessage and persist it.
 *
 * AgentMail (and similar email providers) wrap inbound mail events in a
 * variety of shapes. We accept any of:
 *   { event_type: "message.received", message: {...} }
 *   { type: "message.received", data: { message: {...} } }
 *   { type: "message.received", data: {...} }
 *   {...message fields directly}
 *
 * The inner email object can use any of:
 *   id | message_id | email_id
 *   from | from_email | sender
 *   to  | to_email | recipient
 *   subject
 *   text | body | html
 *   received_at | created_at | timestamp
 *   thread_id | thread
 */
export async function ingestAgentMailWebhook(
  payload: unknown,
): Promise<IngestResult> {
  const obj = (payload ?? {}) as Record<string, unknown>;
  const event_type =
    pickString(obj, ["event_type", "type"]) ?? "message.received";

  // Be permissive: only ignore if the event type clearly opts out.
  if (
    event_type &&
    !/received|message|email|inbound/i.test(event_type)
  ) {
    return { ok: true, inserted: false, reason: "event_ignored", event_type };
  }

  const message = extractInnerMessage(obj);
  if (!message) {
    return { ok: false, inserted: false, reason: "no_message_payload", event_type };
  }

  const source_id =
    pickString(message, ["message_id", "id", "email_id", "uid"]) ??
    `am_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const messageId = `msg_am_${slug(source_id)}`;

  const fromEmailRaw =
    pickString(message, ["from_email", "from", "sender", "sender_email"]) ?? "";
  const fromEmail = normalizeEmail(fromEmailRaw);
  const fromName =
    pickString(message, ["from_name", "sender_name"]) ??
    extractDisplayName(fromEmailRaw) ??
    fromEmail ??
    "Unknown sender";

  const toEmailRaw =
    pickString(message, ["to_email", "to", "recipient", "to_address"]) ?? "";
  const toEmail = normalizeEmail(toEmailRaw);

  const subject = (
    pickString(message, ["subject", "title"]) ?? "(no subject)"
  ).slice(0, 240);

  const text =
    pickString(message, ["text", "body", "plain", "content"]) ??
    stripHtml(pickString(message, ["html", "html_body"]) ?? "") ??
    "";

  const received_at =
    pickString(message, ["received_at", "created_at", "timestamp", "date"]) ??
    new Date().toISOString();

  const thread_id = pickString(message, ["thread_id", "thread"]) ?? undefined;

  const customerId = customerIdFor(fromEmail || source_id);
  const customer: Customer = {
    id: customerId,
    name: fromName,
    email: fromEmail,
    vip: false,
    prior_refunds: 0,
    lifetime_value: 0,
    created_at: new Date().toISOString(),
  };
  await store.upsertCustomer(customer);

  const inbound: InboundMessage = {
    id: messageId,
    customer_id: customerId,
    channel: "email",
    subject,
    body: text || subject,
    received_at,
    status: "new",
    amount_hint: detectAmount(`${subject}\n${text}`),
    source_id,
    thread_id,
  };

  const { inserted, message: stored } = await store.addMessage(inbound);

  return {
    ok: true,
    inserted,
    reason: inserted ? "inserted" : "duplicate",
    message: stored,
    customer,
    event_type,
  };
}

function extractInnerMessage(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  const candidates: unknown[] = [
    payload.message,
    payload.email,
    (payload.data as Record<string, unknown> | undefined)?.message,
    (payload.data as Record<string, unknown> | undefined)?.email,
    payload.data,
    payload,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object") {
      const obj = c as Record<string, unknown>;
      // Heuristic: looks like an email if it has from/text/subject/id
      if (
        obj.from ||
        obj.from_email ||
        obj.subject ||
        obj.text ||
        obj.body ||
        obj.html ||
        obj.message_id ||
        obj.id
      ) {
        return obj;
      }
    }
  }
  return null;
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function normalizeEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  return raw.trim().toLowerCase();
}

function extractDisplayName(raw: string): string | undefined {
  const m = raw.match(/^([^<]+)</);
  if (m) {
    const name = m[1].trim().replace(/^"|"$/g, "");
    if (name) return name;
  }
  return undefined;
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
}

function customerIdFor(email: string): string {
  return `cus_live_${slug(email)}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAmount(text: string): number | undefined {
  // Prefer the FIRST dollar amount — in negotiation-shaped messages people
  // lead with their budget. Refund/sponsorship messages typically only
  // contain one amount so order doesn't matter for those.
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
