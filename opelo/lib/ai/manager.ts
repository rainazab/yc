import {
  ActionType,
  Classification,
  Customer,
  Decision,
  InboundMessage,
  MockExternalAction,
  Policies,
  ProcessResult,
} from "../types";
import { classifyHeuristic } from "./classify";
import { enhanceWithLLM } from "./llm";
import { agentmail } from "../integrations/agentmail";
import {
  createRefund as spongeCreateRefund,
  toMockExternalAction as spongeAction,
} from "../integrations/sponge";
import {
  createStripePaymentLink,
  toMockExternalAction as stripeAction,
} from "../integrations/stripe";
import { createSpongeMcpPaymentLink } from "../integrations/sponge_mcp";
import {
  sendOwnerUpdate as agentphoneSendOwnerUpdate,
  sendSMS as agentphoneSendSMS,
  sendDirectSMS,
} from "../integrations/agentphone";
import { store } from "../db/store";
import type { PendingOwnerAction } from "../db/store";
import { nanoid } from "../integrations/util";
import { calendar } from "../integrations/calendar";
import {
  saveDecision as supermemorySaveDecision,
  searchMemory as supermemorySearch,
  toMockExternalAction as supermemoryAction,
} from "../integrations/supermemory";
import { demoBusiness } from "../business";

export interface ProcessOptions {
  useLLM?: boolean;
  managerName?: string;
  /** Prior conversation turns passed through to the LLM for context. */
  conversationHistory?: { role: "user" | "model"; text: string }[];
}

interface DecisionPlan {
  decision: Decision;
  action_type: ActionType;
  policy_applied: string;
  fallback_customer_response: string;
  fallback_owner_summary: string;
  fallback_reasoning_summary: string;
  revenue_delta: number;
  counter_offer?: number;
}

export async function processInboundMessage(
  message: InboundMessage,
  policies: Policies,
  customer: Customer,
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  const hints = classifyHeuristic(message, policies);
  const classification: Classification = hints.classification;
  const isVip =
    customer.vip || policies.vip_customers.includes(customer.email);

  // ── Pull past context from Supermemory so the LLM knows this customer ──────
  const memQuery  = `${customer.name} ${customer.email || customer.id}`;
  const memResult = await supermemorySearch(memQuery);
  const pastContext = memResult.data.matches.length > 0
    ? `\n\nPast interactions with this customer:\n${memResult.data.matches.join("\n---\n")}`
    : "";

  const plan = decide({
    classification,
    detected_amount: hints.detected_amount,
    is_escalation: hints.is_escalation,
    is_vip: isVip,
    customer,
    policies,
  });

  // Default texts come from deterministic engine. LLM optionally rewrites tone.
  let reasoning_summary = plan.fallback_reasoning_summary;
  let customer_response = plan.fallback_customer_response;
  let owner_summary = plan.fallback_owner_summary;
  let llm_used = false;

  if (options.useLLM !== false) {
    const enhanced = await enhanceWithLLM({
      classification,
      decision: plan.decision,
      policy_applied: plan.policy_applied,
      detected_amount: hints.detected_amount,
      customer_name: customer.name,
      customer_email: customer.email,
      is_vip: isVip,
      // Append past context so Gemini knows if they've had issues before
      message_body: message.body + pastContext,
      next_slot_label:
        plan.decision === "schedule" ? calendar.nextSlotLabel() : undefined,
      manager_name: options.managerName,
    });
    if (enhanced) {
      llm_used = true;
      if (enhanced.reasoning_summary) reasoning_summary = enhanced.reasoning_summary;
      if (enhanced.customer_response) customer_response = enhanced.customer_response;
      if (enhanced.owner_summary) owner_summary = enhanced.owner_summary;
      // Trust Gemini's policy label if provided.
      if (enhanced.refined_policy_applied) {
        plan.policy_applied = enhanced.refined_policy_applied;
      }
    }
  }

  const externalActions = await runExternalActions({
    plan,
    message,
    customer,
    customer_response,
    owner_summary,
    detected_amount: hints.detected_amount,
  });

  return {
    classification,
    reasoning_summary,
    decision: plan.decision,
    policy_applied: plan.policy_applied,
    customer_response,
    owner_summary,
    action_type: plan.action_type,
    mock_external_actions: externalActions,
    llm_used,
    revenue_delta: plan.revenue_delta,
    detected_amount: hints.detected_amount,
    counter_offer: plan.counter_offer,
  };
}

interface DecideArgs {
  classification: Classification;
  detected_amount?: number;
  is_escalation: boolean;
  is_vip: boolean;
  customer: Customer;
  policies: Policies;
}

function decide(args: DecideArgs): DecisionPlan {
  const { classification, detected_amount, is_escalation, is_vip, customer, policies } = args;

  if (is_escalation && classification !== "refund_request") {
    return {
      decision: "escalate_to_owner",
      action_type: "owner_escalated",
      policy_applied:
        "Escalate angry or complaint-heavy messages to the owner before replying.",
      fallback_reasoning_summary:
        "Detected escalation language — routed to owner before any auto-reply.",
      fallback_customer_response: `Hi ${firstName(customer.name)}, I'm sorry for the slow response — your note has been flagged for me personally and I'll get back to you today.\n\n— Sent by your Opelo AI manager`,
      fallback_owner_summary: `Escalated: "${customer.name}" — angry/complaint language detected. Hold off on auto-reply.`,
      revenue_delta: 0,
    };
  }

  switch (classification) {
    case "refund_request": {
      const amt = detected_amount ?? 0;
      if (is_vip) {
        return {
          decision: "escalate_to_owner",
          action_type: "owner_escalated",
          policy_applied: "VIP customers always escalate to owner before rejection or refund.",
          fallback_reasoning_summary:
            "VIP customer requested a refund — escalating to owner per VIP policy.",
          fallback_customer_response: `Hi ${firstName(customer.name)}, thanks for reaching out. Because you're a long-time partner, I'd like to handle this personally and will follow up within the day.`,
          fallback_owner_summary: `VIP refund request from ${customer.name} ($${amt.toFixed(2)}). Awaiting your call.`,
          revenue_delta: 0,
        };
      }
      if (amt > 0 && amt < policies.refund_auto_approve_under && customer.prior_refunds === 0) {
        return {
          decision: "approve",
          action_type: "refund_issued",
          policy_applied: `Auto-approve refunds under $${policies.refund_auto_approve_under}`,
          fallback_reasoning_summary: `Refund of $${amt.toFixed(2)} fell under the auto-approve threshold and the customer has no prior refunds.`,
          fallback_customer_response: `Thanks for reaching out — I've approved and processed your $${amt.toFixed(2)} refund. You should see it on your statement within a few business days. If there's anything I can do better next time, I'd love to hear it.`,
          fallback_owner_summary: `Approved a $${amt.toFixed(2)} refund under your auto-refund policy.`,
          revenue_delta: -amt,
        };
      }
      if (amt >= policies.refund_auto_approve_under) {
        return {
          decision: "escalate_to_owner",
          action_type: "owner_escalated",
          policy_applied: `Refunds at or above $${policies.refund_auto_approve_under} require owner approval`,
          fallback_reasoning_summary: `Refund of $${amt.toFixed(2)} exceeds your auto-approve threshold — escalated.`,
          fallback_customer_response: `Thanks for the note — I want to make sure we handle this right. Sending this to the owner for a quick look; you'll hear back within 1 business day.`,
          fallback_owner_summary: `Refund hold for review: ${customer.name} — $${amt.toFixed(2)} (above auto threshold).`,
          revenue_delta: 0,
        };
      }
      // Refund abuse path
      return {
        decision: "escalate_to_owner",
        action_type: "owner_escalated",
        policy_applied: "Customers with prior refund history require owner review",
        fallback_reasoning_summary:
          "Refund requested by a customer with prior refund history — flagging for owner review.",
        fallback_customer_response: `Thanks for reaching out. I want to make sure we get this right, so the owner will personally review your request and get back to you within 1 business day.`,
        fallback_owner_summary: `Refund request from repeat refunder ${customer.name} — review.`,
        revenue_delta: 0,
      };
    }

    case "sponsorship_offer": {
      const amt = detected_amount ?? 0;
      if (amt >= policies.min_sponsorship_price) {
        return {
          decision: "approve",
          action_type: "auto_reply_sent",
          policy_applied: `Sponsorships at or above $${policies.min_sponsorship_price} can move forward`,
          fallback_reasoning_summary: `Sponsorship offer of $${amt.toFixed(0)} meets your minimum — moved to contract.`,
          fallback_customer_response: `Thanks for reaching out — this looks like a fit. I'll send over a one-pager with deliverables, timelines, and the contract today. Looking forward to working together.`,
          fallback_owner_summary: `Approved a $${amt.toFixed(0)} sponsorship. Contract is being sent.`,
          revenue_delta: amt,
        };
      }
      return {
        decision: "negotiate",
        action_type: "sponsorship_countered",
        policy_applied: `Reject sponsorships under $${policies.min_sponsorship_price}; counter to floor`,
        fallback_reasoning_summary: `Offer of $${amt.toFixed(0)} is below your $${policies.min_sponsorship_price} floor — sent a counter at the minimum.`,
        fallback_customer_response: `Thanks so much for reaching out — really like the concept. The package you're describing typically lands at $${policies.min_sponsorship_price.toLocaleString()}, which covers a 60-second integrated read plus 3 short-form posts. Happy to lock that in if it works.`,
        fallback_owner_summary: `Countered a $${amt.toFixed(0)} sponsorship to your $${policies.min_sponsorship_price} floor.`,
        revenue_delta: 0,
        counter_offer: policies.min_sponsorship_price,
      };
    }

    case "pricing_exception": {
      const amt = detected_amount ?? 0;
      if (amt >= policies.min_project_price) {
        return {
          decision: "approve",
          action_type: "auto_reply_sent",
          policy_applied: `Budgets at or above the $${policies.min_project_price} floor are accepted`,
          fallback_reasoning_summary: `Customer's budget of $${amt.toFixed(0)} clears your project floor — moving forward.`,
          fallback_customer_response: `Happy to make that work — let's get started. I'll send over a scoping doc today so we can confirm deliverables and a kickoff date.`,
          fallback_owner_summary: `Accepted project at $${amt.toFixed(0)}.`,
          revenue_delta: amt,
        };
      }
      if (is_vip) {
        return {
          decision: "escalate_to_owner",
          action_type: "owner_escalated",
          policy_applied: "VIP customers always escalate to owner before rejection",
          fallback_reasoning_summary:
            "VIP requesting a discount below floor — escalating to owner.",
          fallback_customer_response: `Thanks for the note — because of your history with us, I want to handle this personally and will get back to you today.`,
          fallback_owner_summary: `VIP ${customer.name} requesting discount below floor.`,
          revenue_delta: 0,
        };
      }
      return {
        decision: "negotiate",
        action_type: "discount_offered",
        policy_applied: `Never discount consulting below $${policies.min_project_price}`,
        fallback_reasoning_summary: `Budget of $${amt.toFixed(0)} is below the $${policies.min_project_price} floor — held the line and proposed a smaller scope.`,
        fallback_customer_response: `Thanks for being upfront on budget — appreciate that. The full consulting package stays at $${(policies.min_project_price + 500).toLocaleString()} so I can deliver the outcome we both want. If $${policies.min_project_price.toLocaleString()} works, I can offer a tighter scope focused on the highest-leverage piece — happy to send a one-pager.`,
        fallback_owner_summary: `Held pricing floor at $${policies.min_project_price.toLocaleString()} with ${customer.name}; offered a reduced scope.`,
        revenue_delta: 0,
        counter_offer: policies.min_project_price,
      };
    }

    case "qualified_lead": {
      const amt = detected_amount ?? 0;
      if (amt >= policies.auto_book_lead_above) {
        return {
          decision: "schedule",
          action_type: "meeting_booked",
          policy_applied: `Auto-book qualified leads above $${policies.auto_book_lead_above}`,
          fallback_reasoning_summary: `Lead with a $${amt.toFixed(0)} budget cleared your auto-book threshold — sent a confirmed time.`,
          fallback_customer_response: `Thanks — this is exactly the kind of project I love working on. I've put you on the calendar for ${calendar.nextSlotLabel()}. You'll get an invite shortly. Looking forward.`,
          fallback_owner_summary: `Auto-booked $${amt.toFixed(0)} lead ${customer.name} for ${calendar.nextSlotLabel()}.`,
          revenue_delta: amt,
        };
      }
      return {
        decision: "schedule",
        action_type: "meeting_booked",
        policy_applied: "Offer intro call from booking availability",
        fallback_reasoning_summary: `Qualified lead under the auto-book threshold — sent intro slots.`,
        fallback_customer_response: `Thanks for reaching out — would love to learn more. I have availability ${policies.booking_availability}. Send a time that works and I'll confirm.`,
        fallback_owner_summary: `Sent intro slots to lead ${customer.name}.`,
        revenue_delta: 0,
      };
    }

    case "scheduling_request": {
      return {
        decision: "schedule",
        action_type: "meeting_booked",
        policy_applied: "Booking availability auto-reply",
        fallback_reasoning_summary: "Scheduling request — sent your standing availability.",
        fallback_customer_response: `Happy to find a time. My standing availability is ${policies.booking_availability}. Send a window that works and I'll confirm.`,
        fallback_owner_summary: `Sent booking availability to ${customer.name}.`,
        revenue_delta: 0,
      };
    }

    case "escalation":
    default: {
      return {
        decision: "escalate_to_owner",
        action_type: "owner_escalated",
        policy_applied: "Escalate angry or complaint-heavy messages to the owner",
        fallback_reasoning_summary: "Escalation language detected — routed to owner.",
        fallback_customer_response: `Hi ${firstName(customer.name)}, I'm so sorry for the trouble. I've flagged this for the owner directly and you'll hear back within the day.`,
        fallback_owner_summary: `Escalated ${customer.name} — complaint language. Please reply directly.`,
        revenue_delta: 0,
      };
    }
  }
}

interface RunArgs {
  plan: DecisionPlan;
  message: InboundMessage;
  customer: Customer;
  customer_response: string;
  owner_summary: string;
  detected_amount?: number;
}

async function runExternalActions(args: RunArgs): Promise<MockExternalAction[]> {
  const { plan, message, customer, customer_response, owner_summary, detected_amount } = args;
  const actions: MockExternalAction[] = [];

  if (plan.action_type === "refund_issued") {
    const amt = detected_amount ?? 0;
    const resp = await spongeCreateRefund({
      customerId: customer.id,
      amountCents: Math.round(amt * 100),
      reason: "Auto-approved under owner policy",
    });
    actions.push(
      spongeAction(
        resp,
        `Refunded $${amt.toFixed(2)} to ${customer.email} via Sponge.`,
      ),
    );
  }

  // ── Dual-rail payment link (Stripe card + Sponge crypto) ────────────────────
  if (plan.action_type === "discount_offered" || plan.action_type === "sponsorship_countered") {
    const counter = plan.counter_offer ?? 0;
    if (counter > 0) {
      const desc = plan.action_type === "sponsorship_countered"
        ? `${demoBusiness.name} — sponsorship`
        : `${demoBusiness.name} — project deposit`;
      const cents = Math.round(counter * 100);

      // Create both rails in parallel
      const [stripeRes, spongeRes] = await Promise.allSettled([
        createStripePaymentLink({ amountCents: cents, description: desc, customerEmail: customer.email || undefined }),
        createSpongeMcpPaymentLink({ description: desc, amountUsd: counter }),
      ]);

      const stripeUrl = stripeRes.status === "fulfilled" && stripeRes.value.mode === "live" ? stripeRes.value.url : undefined;
      const spongeUrl = spongeRes.status === "fulfilled" ? spongeRes.value.url : undefined;

      // Store a unified /pay/[id] record
      const payId = nanoid("pay");
      await store.savePaymentLink({
        id: payId,
        action_id: "",
        customer_id: customer.id,
        business_name: demoBusiness.name,
        description: desc,
        amount_cents: cents,
        stripe_url: stripeUrl,
        sponge_url: spongeUrl,
        status: "pending",
        created_at: new Date().toISOString(),
      });

      // The URL we send to the customer — prefer the unified page so they see both options
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const payUrl = stripeUrl || spongeUrl
        ? `${baseUrl}/pay/${payId}`
        : `${baseUrl}/pay/${payId}`;

      actions.push(
        stripeAction(
          { id: payId, url: payUrl, amount_cents: cents, capped: false, mode: stripeUrl ? "live" : "mock" },
          `Payment page (card + crypto) for $${counter.toLocaleString()} → ${payUrl}`,
        ),
      );
    }
  }

  if (plan.action_type === "meeting_booked") {
    actions.push(
      await calendar.bookMeeting({
        attendee_email: customer.email,
        attendee_name: customer.name,
        duration_minutes: 30,
        topic: message.subject,
      }),
    );
  }

  // ── Reply to customer on their original channel ──────────────────────────
  const isLiveCustomer = customer.id.startsWith("cus_live_");
  switch (message.channel) {
    case "email":
      actions.push(
        await agentmail.sendReply({
          to: customer.email,
          subject: `Re: ${message.subject}`,
          body: customer_response,
          in_reply_to: message.id,
          source_id: message.source_id,
          thread_id: message.thread_id,
          live: isLiveCustomer,
        }),
      );
      break;
    case "sms":
    case "phone_transcript": {
      // After a call, send the caller a clean SMS summary of what was decided
      const to = customer.phone || "+15555550100";
      const apMeta = message.metadata?.agentphone;

      const callSummary = buildCallSummary(plan, customer_response, owner_summary);

      actions.push(
        await agentphoneSendSMS({
          to,
          body: callSummary,
          live: isLiveCustomer && !!customer.phone,
          source_id: message.source_id,
          agentId: apMeta?.agentId,
          conversationId: apMeta?.conversationId,
          numberId: apMeta?.numberId,
          channel: apMeta?.channel,
        }),
      );
      break;
    }
    case "social_dm":
    default:
      actions.push({
        name: "social.mock.dm.replied",
        ok: true,
        ref: nanoid("dm"),
        detail: `DM reply queued for ${customer.name} (demo — social DM send is mocked).`,
      });
      break;
  }

  // ── Owner notification — plain summary or actionable YES/NO for escalations ──
  const needsOwnerNotice =
    plan.action_type === "owner_escalated" ||
    plan.action_type === "refund_issued"   ||
    plan.action_type === "meeting_booked"  ||
    plan.action_type === "sponsorship_countered" ||
    plan.action_type === "discount_offered";

  if (needsOwnerNotice) {
    const isCallTranscript = message.channel === "phone_transcript";

    if (plan.action_type === "owner_escalated") {
      // Save a pending action so the owner can reply YES/NO
      const pendingId = nanoid("poa");
      const pendingAction: PendingOwnerAction = {
        id: pendingId,
        action_id: "",
        type: args.detected_amount && args.detected_amount > 0 ? "approve_refund" : "review",
        description: owner_summary,
        customer_id: customer.id,
        customer_phone: customer.phone,
        amount_cents: args.detected_amount ? Math.round(args.detected_amount * 100) : undefined,
        resolved: false,
        created_at: new Date().toISOString(),
      };
      await store.savePendingOwnerAction(pendingAction);

      // Actionable SMS: includes the YES/NO reply code
      const smsLines: string[] = [];
      if (isCallTranscript) {
        smsLines.push(`📞 Call from ${customer.name}`);
      } else {
        smsLines.push(`💬 ${customer.name} needs your attention`);
      }
      smsLines.push(owner_summary);
      smsLines.push(`Reply YES·${pendingId} to approve or NO·${pendingId} to decline`);
      actions.push(await agentphoneSendOwnerUpdate(smsLines.join("\n")));

    } else {
      // Non-escalation: standard summary with call context if applicable
      const prefix = isCallTranscript ? "📞 Call handled" : "✅ Opelo";
      const callContext = isCallTranscript
        ? `\nCall from ${customer.name} (${customer.phone ?? "unknown number"})`
        : "";
      actions.push(await agentphoneSendOwnerUpdate(`${prefix}: ${owner_summary}${callContext}`));
    }
  }

  const memResp = await supermemorySaveDecision({
    customerId: customer.id,
    customerName: customer.name,
    classification: args.plan.action_type,
    decision: args.plan.decision,
    policyApplied: args.plan.policy_applied,
    ownerSummary: owner_summary,
    amountCents: detected_amount ? Math.round(detected_amount * 100) : undefined,
  });
  actions.push(
    supermemoryAction(
      memResp,
      `Saved decision to ${demoBusiness.name} memory.`,
    ),
  );

  return actions;
}

function firstName(full: string): string {
  return full.split(/\s+/)[0] || full;
}

function buildCallSummary(
  plan: DecisionPlan,
  customerResponse: string,
  ownerSummary: string,
): string {
  const lines: string[] = ["📞 Call summary from Opelo:"];

  switch (plan.action_type) {
    case "refund_issued":
      lines.push(`✅ Your refund of $${Math.abs(plan.revenue_delta || 0).toFixed(2)} has been approved and processed.`);
      lines.push("You'll see it on your statement in 3–5 business days.");
      break;
    case "meeting_booked":
      lines.push("📅 Your meeting has been confirmed.");
      lines.push(customerResponse.split("\n")[0] || ownerSummary);
      break;
    case "owner_escalated":
      lines.push("🔔 Your request has been flagged for the owner.");
      lines.push("You'll hear back within 1 business day.");
      break;
    case "sponsorship_countered":
      lines.push("💬 We sent you a counter-offer.");
      lines.push(customerResponse.split("\n")[0] || ownerSummary);
      break;
    case "discount_offered":
      lines.push("💬 We've held our pricing floor and proposed an alternative scope.");
      lines.push(customerResponse.split("\n")[0] || ownerSummary);
      break;
    default:
      lines.push(customerResponse.split("\n")[0] || ownerSummary);
  }

  lines.push("\nReply to this message if you have questions.");
  return lines.join("\n");
}
