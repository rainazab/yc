import { MockExternalAction } from "../types";
import { isDemo, nanoid } from "./util";

export interface AgentPhoneSMS {
  id: string;
  from: string;
  to: string;
  body: string;
  received_at: string;
}

export interface AgentPhoneCall {
  id: string;
  from: string;
  to: string;
  duration_seconds: number;
  received_at: string;
  caller_name?: string;
  status: "completed" | "in_progress" | "missed";
}

export interface AgentPhoneResponse<T> {
  ok: boolean;
  provider: "agentphone";
  mode: "mock" | "live";
  action: string;
  data: T;
  error?: string;
}

export interface SendSMSInput {
  to: string;
  body: string;
  /** Set true when this is a real customer who should actually receive the SMS. */
  live?: boolean;
  /** Upstream AgentPhone message id, used for threading if supported. */
  source_id?: string;
  /** Override the agent id (defaults to AGENTPHONE_AGENT_ID env). */
  agentId?: string;
  /** Reply in-thread when we know the conversation. */
  conversationId?: string;
  /** Reserved for future routing. */
  numberId?: string;
  /** Upstream sub-channel ("sms" / "imessage") — surfaces in mock detail. */
  channel?: "sms" | "imessage";
}

interface AttemptedEndpoint {
  url: string;
  method: "POST";
  status: number | null;
  body_preview?: string;
  error?: string;
}

interface SendOutcome {
  ok: boolean;
  action: string;
  ref: string;
  detail: string;
  mode: "mock" | "live";
  attempted_endpoints?: AttemptedEndpoint[];
  hint?: string;
}

function inMockMode(): boolean {
  return isDemo(process.env.AGENTPHONE_API_KEY);
}

function fromNumber(): string | undefined {
  return process.env.AGENTPHONE_NUMBER?.trim() || undefined;
}

function baseUrl(): string {
  return (
    process.env.AGENTPHONE_BASE_URL?.replace(/\/$/, "") ||
    "https://api.agentphone.ai/v1"
  );
}

function mockResponse<T>(action: string, data: T): AgentPhoneResponse<T> {
  return { ok: true, provider: "agentphone", mode: "mock", action, data };
}

function liveResponse<T>(action: string, data: T): AgentPhoneResponse<T> {
  return { ok: true, provider: "agentphone", mode: "live", action, data };
}

function failureResponse<T>(
  action: string,
  data: T,
  error: string,
): AgentPhoneResponse<T> {
  return {
    ok: false,
    provider: "agentphone",
    mode: "live",
    action,
    data,
    error,
  };
}

function preview(text: string, n = 140): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

function looksLikePhone(value: string): boolean {
  if (!value) return false;
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  // Reject the obvious demo placeholders we ship with the seed data.
  if (/^\+?15555550\d{3}$/.test(value)) return false;
  return /^\+?\d+$/.test(value.replace(/[\s().-]/g, ""));
}

function normalizePhone(value: string): string {
  const cleaned = value.replace(/[\s().-]/g, "");
  return cleaned;
}

function forceMockSendEnabled(): boolean {
  const v = process.env.AGENTPHONE_FORCE_MOCK_SEND?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function agentIdFromEnvOr(override?: string): string | undefined {
  return override?.trim() || process.env.AGENTPHONE_AGENT_ID?.trim() || undefined;
}

function numberIdFromEnvOr(override?: string): string | undefined {
  return (
    override?.trim() || process.env.AGENTPHONE_NUMBER_ID?.trim() || undefined
  );
}

interface EndpointAttempt {
  url: string;
  payload: Record<string, unknown>;
}

/**
 * Try the AgentPhone outbound endpoints in order. Returns on first success.
 * If all fail, returns a SendOutcome with attempted_endpoints + hint so the
 * cockpit can surface exactly which URLs were tried and what they returned.
 */
async function callAgentPhone(input: SendSMSInput): Promise<SendOutcome> {
  const key = process.env.AGENTPHONE_API_KEY!;
  const to = normalizePhone(input.to);
  if (!looksLikePhone(to)) {
    return {
      ok: false,
      action: "agentphone.sms.skipped",
      ref: nanoid("ap"),
      detail: `Recipient looks synthetic ("${input.to}") — skipped real send.`,
      mode: "live",
    };
  }
  const agentId = agentIdFromEnvOr(input.agentId);
  if (!agentId) {
    // Per spec: don't hard-fail when the agent id is unknown; mock the send
    // with a warning so the demo timeline still completes cleanly.
    return {
      ok: true,
      action: "agentphone.mock.sms.sent",
      ref: nanoid("ap"),
      detail: `Missing AGENTPHONE_AGENT_ID; simulated AgentPhone send to ${to}: ${preview(input.body)}`,
      mode: "mock",
      hint: "Set AGENTPHONE_AGENT_ID (or pass agentId via inbound metadata) to make this a real send.",
    };
  }

  // number_id is REQUIRED for shared-imessage agents — without it, AgentPhone
  // 404s with "No active number found for this agent" even though one is
  // active. Confirmed against the OpenAPI schema for POST /v1/messages.
  const numberId = numberIdFromEnvOr(input.numberId);

  const base = baseUrl();
  const attempts: EndpointAttempt[] = [];

  const primaryPayload: Record<string, unknown> = {
    agent_id: agentId,
    to_number: to,
    body: input.body,
  };
  if (numberId) primaryPayload.number_id = numberId;
  // shared-imessage lines require conversation_id in the body to send replies
  if (input.conversationId) primaryPayload.conversation_id = input.conversationId;

  // 1) Primary — POST /messages with number_id when known.
  attempts.push({ url: `${base}/messages`, payload: primaryPayload });

  // 2) Fallback — POST /messages/send (same body shape)
  attempts.push({ url: `${base}/messages/send`, payload: primaryPayload });

  // 3) Fallback — POST /conversations/{conversationId}/messages
  if (input.conversationId) {
    attempts.push({
      url: `${base}/conversations/${encodeURIComponent(input.conversationId)}/messages`,
      payload: { body: input.body },
    });
  }

  // Optional: explicit override via env. Tried first when set.
  const overridePath = process.env.AGENTPHONE_SEND_PATH?.trim();
  if (overridePath) {
    const overrideUrl = overridePath.startsWith("http")
      ? overridePath
      : `${base}${overridePath.startsWith("/") ? overridePath : `/${overridePath}`}`;
    attempts.unshift({ url: overrideUrl, payload: primaryPayload });
  }

  const attempted: AttemptedEndpoint[] = [];
  let lastError: string | undefined;

  for (const a of attempts) {
    try {
      const resp = await fetch(a.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(a.payload),
      });
      const bodyText = await resp.text().catch(() => "");
      attempted.push({
        url: a.url,
        method: "POST",
        status: resp.status,
        body_preview: bodyText.slice(0, 240) || undefined,
      });
      if (resp.ok) {
        let parsedId: string | undefined;
        try {
          const json = JSON.parse(bodyText);
          parsedId =
            json?.id ??
            json?.message_id ??
            json?.data?.id ??
            json?.data?.message_id;
        } catch {
          // ignore
        }
        return {
          ok: true,
          action: "agentphone.sms.sent",
          ref: parsedId ?? nanoid("ap"),
          detail: `Sent via AgentPhone to ${to}: ${preview(input.body)} (POST ${a.url})`,
          mode: "live",
          attempted_endpoints: attempted,
        };
      }
      lastError = `${resp.status} ${resp.statusText}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network_error";
      attempted.push({
        url: a.url,
        method: "POST",
        status: null,
        error: msg,
      });
      lastError = msg;
    }
  }

  return {
    ok: false,
    action: "agentphone.sms.failed",
    ref: nanoid("ap"),
    detail: `All AgentPhone send endpoints failed (last: ${lastError ?? "unknown"}). Tried ${attempted.length} URL${attempted.length === 1 ? "" : "s"}.`,
    mode: "live",
    attempted_endpoints: attempted,
    hint: "Check AgentPhone messages endpoint and AGENTPHONE_AGENT_ID. Set AGENTPHONE_FORCE_MOCK_SEND=true to mock during a demo.",
  };
}

export async function sendSMS(
  input: SendSMSInput,
): Promise<MockExternalAction> {
  const hasKey = !inMockMode();
  const forceMock = forceMockSendEnabled();

  // Mock when: no key, or caller didn't mark as live, or FORCE_MOCK_SEND.
  if (!hasKey || !input.live || forceMock) {
    const why = !hasKey
      ? "no AGENTPHONE_API_KEY"
      : forceMock
        ? "AGENTPHONE_FORCE_MOCK_SEND=true"
        : "seeded customer";
    return {
      name: "agentphone.mock.sms.sent",
      ok: true,
      ref: nanoid("ap"),
      detail: `Sent SMS to ${input.to}: ${preview(input.body)} (demo — ${why}).`,
    };
  }
  const outcome = await callAgentPhone(input);
  return {
    name: outcome.action,
    ok: outcome.ok,
    ref: outcome.ref,
    detail: outcome.detail,
  };
}

export async function sendOwnerUpdate(
  message: string,
): Promise<MockExternalAction> {
  const owner = process.env.OWNER_PHONE_NUMBER?.trim();
  const hasKey = !inMockMode();
  const forceMock = forceMockSendEnabled();
  if (!hasKey || !owner || !looksLikePhone(owner) || forceMock) {
    const fallback = owner || "+15555550123";
    const why = !hasKey
      ? "no AGENTPHONE_API_KEY"
      : forceMock
        ? "AGENTPHONE_FORCE_MOCK_SEND=true"
        : !owner
          ? "OWNER_PHONE_NUMBER missing"
          : "OWNER_PHONE_NUMBER looks synthetic";
    return {
      name: "agentphone.mock.owner_update.sent",
      ok: true,
      ref: nanoid("ap"),
      detail: `SMS to owner ${fallback}: ${preview(message)} (demo — ${why}).`,
    };
  }
  const outcome = await callAgentPhone({ to: owner, body: message, live: true });
  return {
    name: outcome.ok ? "agentphone.owner_update.sent" : outcome.action,
    ok: outcome.ok,
    ref: outcome.ref,
    detail: outcome.detail,
  };
}

export async function sendDirectSMS(input: {
  to: string;
  body: string;
  source_id?: string;
  agentId?: string;
  conversationId?: string;
  numberId?: string;
}): Promise<SendOutcome> {
  if (inMockMode()) {
    return {
      ok: true,
      action: "agentphone.mock.sms.sent",
      ref: nanoid("ap"),
      detail: `Would SMS ${input.to}: ${preview(input.body)} (no AGENTPHONE_API_KEY).`,
      mode: "mock",
    };
  }
  if (forceMockSendEnabled()) {
    return {
      ok: true,
      action: "agentphone.mock.sms.sent",
      ref: nanoid("ap"),
      detail: `Mock send to ${input.to}: ${preview(input.body)} (AGENTPHONE_FORCE_MOCK_SEND=true).`,
      mode: "mock",
    };
  }
  return callAgentPhone({
    to: input.to,
    body: input.body,
    source_id: input.source_id,
    agentId: input.agentId,
    conversationId: input.conversationId,
    numberId: input.numberId,
    live: true,
  });
}

export async function getInboundSMS(): Promise<
  AgentPhoneResponse<AgentPhoneSMS[]>
> {
  if (inMockMode()) {
    return mockResponse("agentphone.mock.inbound_sms.listed", [
      {
        id: "ap_sms_demo",
        from: "+15551234002",
        to: fromNumber() ?? "+15555550100",
        body:
          "I want your consulting package but my budget is $1,500. Can you do that instead of $3,000?",
        received_at: new Date().toISOString(),
      },
    ]);
  }
  // Live inbound is webhook-driven via /api/agentphone/webhook.
  return liveResponse("agentphone.inbound_sms.listed", [] as AgentPhoneSMS[]);
}

export async function getInboundCalls(): Promise<
  AgentPhoneResponse<AgentPhoneCall[]>
> {
  if (inMockMode()) {
    return mockResponse("agentphone.mock.inbound_calls.listed", [
      {
        id: "ap_call_kai",
        from: "+15551234001",
        to: fromNumber() ?? "+15555550100",
        duration_seconds: 47,
        received_at: new Date().toISOString(),
        caller_name: "Kai Whitfield",
        status: "completed",
      },
    ]);
  }
  return liveResponse(
    "agentphone.inbound_calls.listed",
    [] as AgentPhoneCall[],
  );
}

export async function getCallTranscript(
  callId: string,
): Promise<AgentPhoneResponse<{ id: string; transcript: string }>> {
  if (inMockMode()) {
    return mockResponse("agentphone.mock.transcript.loaded", {
      id: callId,
      transcript:
        "Hi, I run a fast-growing DTC brand and need help building an AI customer support workflow. Budget is around $8k. Are you available next week?",
    });
  }
  return liveResponse("agentphone.transcript.loaded", {
    id: callId,
    transcript: "",
  });
}

export interface ParsedSMS {
  source_id: string;
  from: string;
  to?: string;
  body: string;
  received_at: string;
  event_type: string;
  /**
   * Upstream provider identifiers we need to thread back through outbound
   * sends so the reply lands on the same conversation/agent.
   */
  agentId?: string;
  conversationId?: string;
  numberId?: string;
  channel?: "sms" | "imessage";
}

export interface ParsedCall {
  source_id: string;
  from: string;
  to?: string;
  transcript: string;
  received_at: string;
  event_type: string;
  caller_name?: string;
}

// ─── Generic helpers ────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Build the list of candidate containers we'll search for fields. Order
 * matters — earlier containers win when the same field appears in multiple
 * places. We include the well-known wrapper paths AgentPhone, Twilio-likes,
 * and generic webhook frameworks use.
 */
function buildCandidates(payload: unknown): Record<string, unknown>[] {
  if (!isPlainObject(payload)) return [];
  const seen = new Set<Record<string, unknown>>();
  const out: Record<string, unknown>[] = [];
  const push = (v: unknown) => {
    if (isPlainObject(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };

  const root = payload;
  push(root);
  push(root.data as unknown);
  push(root.message as unknown);
  push(root.sms as unknown);
  push(root.call as unknown);
  push(root.conversation as unknown);
  push(root.event as unknown);
  push(root.payload as unknown);

  const data = isPlainObject(root.data) ? (root.data as Record<string, unknown>) : null;
  if (data) {
    push(data.message);
    push(data.sms);
    push(data.call);
    push(data.conversation);
    push(data.event);
  }

  const conv = isPlainObject(root.conversation)
    ? (root.conversation as Record<string, unknown>)
    : null;
  if (conv) push(conv.message);

  const event = isPlainObject(root.event)
    ? (root.event as Record<string, unknown>)
    : null;
  if (event) push(event.data);

  // First entries of `messages` / `data.messages` arrays.
  const msgs = root.messages;
  if (Array.isArray(msgs) && msgs.length > 0) push(msgs[0]);
  if (data && Array.isArray(data.messages) && data.messages.length > 0)
    push(data.messages[0] as unknown);

  return out;
}

/**
 * Walk the candidate list looking for any of the given keys. Supports dotted
 * keys like "contact.phone" for one level of nesting.
 */
function pick(
  candidates: Record<string, unknown>[],
  keys: string[],
): string | undefined {
  for (const c of candidates) {
    for (const k of keys) {
      if (k.includes(".")) {
        const [head, tail] = k.split(".");
        const child = c[head];
        if (isPlainObject(child)) {
          const v = (child as Record<string, unknown>)[tail];
          if (typeof v === "string" && v.trim()) return v.trim();
          if (typeof v === "number" && Number.isFinite(v)) return String(v);
        }
      } else {
        const v = c[k];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (typeof v === "number" && Number.isFinite(v)) return String(v);
      }
    }
  }
  return undefined;
}

const BODY_KEYS = [
  "body",
  "text",
  "content",
  "message",
  "message_text",
  "input",
  "value",
];
const TRANSCRIPT_KEYS = ["transcript", "transcription", "call_transcript"];
const FROM_KEYS_SMS = [
  "from",
  "from_number",
  "sender",
  "sender_number",
  "phone",
  "phone_number",
  "msisdn",
  "contact.phone",
  "participant.phone",
];
const FROM_KEYS_CALL = [
  "from",
  "from_number",
  "caller",
  "caller_number",
  "phone",
  "phone_number",
  "contact.phone",
];
const TO_KEYS = [
  "to",
  "to_number",
  "recipient",
  "recipient_number",
  "number",
  "inbox_number",
];
const ID_KEYS_SMS = [
  "id",
  "message_id",
  "sms_id",
  "conversation_id",
  "event_id",
  "uid",
];
const ID_KEYS_CALL = [
  "id",
  "call_id",
  "conversation_id",
  "recording_id",
  "event_id",
];

export function eventTypeOf(payload: unknown): string {
  if (!isPlainObject(payload)) return "";
  const v = payload.event ?? payload.event_type ?? payload.type;
  return typeof v === "string" ? v : "";
}

// ─── SMS parser ─────────────────────────────────────────────────────────────

export function normalizeInboundSMS(payload: unknown): ParsedSMS | null {
  if (!isPlainObject(payload)) return null;
  const cs = buildCandidates(payload);
  const event_type = eventTypeOf(payload).toLowerCase();

  const looksLikeCallEvent = /call|voice|recording|transcrib/i.test(event_type);
  const looksLikeSMSEvent =
    /sms|imessage|message|conversation|inbound|received/i.test(event_type);

  // Prefer SMS-shaped body fields; only fall back to transcript if the event
  // type clearly says SMS/message.
  let body = pick(cs, BODY_KEYS);
  if (!body && looksLikeSMSEvent) body = pick(cs, TRANSCRIPT_KEYS);

  const from = pick(cs, FROM_KEYS_SMS);
  if (!from || !body) return null;

  // If it walks like a call (transcript field present, call event), don't
  // claim it as SMS — let the call parser have it.
  const hasTranscriptField = !!pick(cs, TRANSCRIPT_KEYS);
  if ((looksLikeCallEvent || hasTranscriptField) && !looksLikeSMSEvent) {
    return null;
  }

  const source_id =
    pick(cs, ID_KEYS_SMS) ??
    pick(cs, ["conversation_id", "conversationId"]) ??
    `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const to = pick(cs, TO_KEYS);
  const received_at =
    pick(cs, ["received_at", "created_at", "timestamp", "date"]) ??
    new Date().toISOString();

  // AgentPhone metadata threaded into the outbound send so replies stay on
  // the same conversation/agent. Top-level `channel` lives on the root,
  // conversationId/numberId on `data`.
  const agentId = pick(cs, ["agentId", "agent_id"]);
  const conversationId = pick(cs, ["conversationId", "conversation_id"]);
  const numberId = pick(cs, ["numberId", "number_id"]);
  const channelRaw = pick(cs, ["channel"])?.toLowerCase();
  const channel: "sms" | "imessage" | undefined =
    channelRaw === "imessage" || channelRaw === "sms"
      ? (channelRaw as "sms" | "imessage")
      : undefined;

  return {
    source_id,
    from,
    to,
    body,
    received_at,
    event_type: event_type || "sms.received",
    agentId,
    conversationId,
    numberId,
    channel,
  };
}

// ─── Call parser ────────────────────────────────────────────────────────────

export function normalizeInboundCall(payload: unknown): ParsedCall | null {
  if (!isPlainObject(payload)) return null;
  const cs = buildCandidates(payload);
  const event_type = eventTypeOf(payload).toLowerCase();
  const looksLikeCall =
    /call|voice|recording|transcrib|phone/i.test(event_type);

  // Transcript: prefer explicit transcript fields, then summary, then
  // generic content/text.
  const transcript =
    pick(cs, TRANSCRIPT_KEYS) ??
    pick(cs, ["summary", "text", "content"]);
  if (!transcript) return null;

  // Only accept as a call if either the event type screams "call" or one of
  // the explicit transcript fields is what we matched on.
  const usedTranscriptField = !!pick(cs, TRANSCRIPT_KEYS);
  if (!looksLikeCall && !usedTranscriptField) return null;

  const from = pick(cs, FROM_KEYS_CALL);
  if (!from) return null;

  const source_id =
    pick(cs, ID_KEYS_CALL) ?? `apcall_${Date.now()}`;
  const to = pick(cs, TO_KEYS);
  const received_at =
    pick(cs, ["received_at", "created_at", "timestamp", "date"]) ??
    new Date().toISOString();
  const caller_name = pick(cs, [
    "caller_name",
    "name",
    "contact_name",
    "display_name",
  ]);

  return {
    source_id,
    from,
    to,
    transcript,
    received_at,
    event_type: event_type || "call.transcribed",
    caller_name,
  };
}

export function toMockExternalAction(
  resp: AgentPhoneResponse<unknown>,
  detail: string,
): MockExternalAction {
  return {
    name: resp.action,
    ok: resp.ok,
    ref: nanoid("ap"),
    detail,
  };
}

export const agentphone = {
  sendSMS,
  sendOwnerUpdate,
  sendDirectSMS,
  getInboundSMS,
  getInboundCalls,
  getCallTranscript,
  normalizeInboundSMS,
  normalizeInboundCall,
  eventTypeOf,
  inMockMode,
};
