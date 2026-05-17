export type Classification =
  | "refund_request"
  | "pricing_exception"
  | "sponsorship_offer"
  | "qualified_lead"
  | "scheduling_request"
  | "escalation";

export type Decision =
  | "approve"
  | "reject"
  | "negotiate"
  | "schedule"
  | "escalate_to_owner";

export type ActionType =
  | "refund_issued"
  | "discount_offered"
  | "sponsorship_declined"
  | "sponsorship_countered"
  | "meeting_booked"
  | "owner_escalated"
  | "lead_nurtured"
  | "auto_reply_sent";

export type MessageStatus = "new" | "processing" | "handled";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  vip: boolean;
  prior_refunds: number;
  lifetime_value: number;
  created_at: string;
}

export type Channel = "email" | "sms" | "form" | "phone_transcript" | "social_dm";

export interface InboundMessageMetadata {
  agentphone?: {
    agentId?: string;
    conversationId?: string;
    numberId?: string;
    /**
     * Upstream sub-channel ("sms" or "imessage"). Mapped down to our
     * top-level Channel ("sms") so the cockpit shows a unified SMS column.
     */
    channel?: "sms" | "imessage";
  };
}

export interface InboundMessage {
  id: string;
  customer_id: string;
  channel: Channel;
  subject: string;
  body: string;
  received_at: string;
  status: MessageStatus;
  amount_hint?: number | null;
  source_id?: string;
  thread_id?: string;
  metadata?: InboundMessageMetadata;
}

export interface Policies {
  refund_auto_approve_under: number;
  min_sponsorship_price: number;
  min_project_price: number;
  vip_customers: string[];
  escalation_keywords: string[];
  booking_availability: string;
  auto_book_lead_above: number;
}

export interface MockExternalAction {
  name: string;
  ok: boolean;
  ref: string;
  detail?: string;
}

export interface ProcessResult {
  classification: Classification;
  reasoning_summary: string;
  decision: Decision;
  policy_applied: string;
  customer_response: string;
  owner_summary: string;
  action_type: ActionType;
  mock_external_actions: MockExternalAction[];
  llm_used: boolean;
  revenue_delta: number;
  detected_amount?: number;
  counter_offer?: number;
}

export interface ActionRecord {
  id: string;
  message_id: string;
  customer_id: string;
  classification: Classification;
  decision: Decision;
  policy_applied: string;
  reasoning_summary: string;
  customer_response: string;
  owner_summary: string;
  action_type: ActionType;
  mock_external_actions: MockExternalAction[];
  revenue_delta: number;
  counter_offer?: number;
  llm_used: boolean;
  created_at: string;
}

export interface CompanyWallet {
  available_cents: number;
  pending_cents: number;
  refunded_today_cents: number;
  revenue_generated_today_cents: number;
  currency: "USD";
  updated_at: string;
}

export interface OwnerSummary {
  id: string;
  period_start: string;
  period_end: string;
  text: string;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  provider: "agentphone" | "agentmail";
  event_type: string;
  payload: unknown;
  parsed_kind?: "sms" | "call" | "email" | "unknown";
  inserted_message_id?: string;
  created_at: string;
}
