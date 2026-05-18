/**
 * Conversational handler — the entry point for every inbound message.
 *
 * Flow:
 *  1. Fetch conversation history from AgentPhone (last 10 messages)
 *  2. Call Gemini in conversational mode with full history
 *  3a. If mode="chat"  → send the natural reply directly, no action record
 *  3b. If mode="action" → run the full business-logic pipeline (classify,
 *       decide, execute: refund / payment / booking / escalation)
 *
 * This gives customers a natural back-and-forth experience instead of Opelo
 * immediately firing a canned decision after the first message.
 */

import { Customer, InboundMessage, Policies, ProcessResult } from "../types";
import { callGeminiConversational } from "./gemini";
import { processInboundMessage } from "./manager";
import { fetchConversationHistory, buildPoliciesSummary } from "./conversation";
import { sendSMS as agentphoneSendSMS } from "../integrations/agentphone";
import { store } from "../db/store";
import { nanoid } from "../integrations/util";
import { classifyHeuristic } from "./classify";

export interface ConversationalHandlerInput {
  message:        InboundMessage;
  customer:       Customer;
  policies:       Policies;
  conversationId?: string;
  managerName?:   string;
}

/**
 * Handles an inbound message conversationally.
 * Returns a ProcessResult (compatible with the existing action-record pipeline).
 */
export async function handleConversationalMessage(
  input: ConversationalHandlerInput,
): Promise<ProcessResult> {
  const { message, customer, policies, conversationId, managerName = "Opelo" } = input;

  // 1. Fetch conversation history (skip for calls — transcript is self-contained)
  const history = message.channel === "phone_transcript"
    ? []
    : await fetchConversationHistory(conversationId ?? "", 10);

  // 2. Build business context for Gemini
  const businessName        = await store.getBusinessName();
  const businessDescription = await store.getBusinessDescription();
  const policiesSummary     = buildPoliciesSummary(policies);

  // 3. Try the conversational Gemini call
  const conv = await callGeminiConversational({
    businessName,
    businessDescription,
    policiesSummary,
    managerName,
    history,
    latestMessage: message.body,
    customerName:  customer.name,
  });

  // 4a. Chat mode — send the reply directly without running the full pipeline
  if (conv && conv.mode === "chat" && conv.customer_response) {
    const isLiveCustomer = customer.id.startsWith("cus_live_");
    const apMeta = message.metadata?.agentphone;

    await agentphoneSendSMS({
      to:             customer.phone || "+15555550100",
      body:           conv.customer_response,
      live:           isLiveCustomer && !!customer.phone,
      source_id:      message.source_id,
      agentId:        apMeta?.agentId,
      conversationId: apMeta?.conversationId,
      numberId:       apMeta?.numberId,
      channel:        apMeta?.channel,
    });

    // Return a minimal ProcessResult so the webhook can still persist a record
    const hints = classifyHeuristic(message, policies);
    return {
      classification:      hints.classification,
      reasoning_summary:   "Conversational reply — gathering more context.",
      decision:            "auto_reply_sent" as ProcessResult["decision"],
      policy_applied:      "Conversational mode",
      customer_response:   conv.customer_response,
      owner_summary:       `Chatting with ${customer.name.split(" ")[0]}`,
      action_type:         "auto_reply_sent",
      mock_external_actions: [{
        name: "agentphone.sms.sent",
        ok: true,
        ref: nanoid("ap"),
        detail: `Conversational reply to ${customer.name}: "${conv.customer_response.slice(0, 80)}"`,
      }],
      llm_used:     true,
      revenue_delta: 0,
    };
  }

  // 4b. Action mode (or Gemini unavailable) — run full business pipeline
  // If Gemini returned an action mode, inject classification/decision hints
  // so the deterministic engine can be overridden.
  const processOptions = {
    useLLM:      true,
    managerName,
    // Pass conversation history so the LLM enhancer has full context too
    conversationHistory: history,
  };

  return processInboundMessage(message, policies, customer, processOptions);
}
