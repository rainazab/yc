import { NextRequest, NextResponse } from "next/server";
import { ingestAgentPhoneWebhook } from "@/lib/integrations/agentphone_ingest";
import { store } from "@/lib/db/store";
import { eventTypeOf, normalizeInboundSMS, sendDirectSMS } from "@/lib/integrations/agentphone";
import { processInboundMessage } from "@/lib/ai/manager";
import { handleConversationalMessage } from "@/lib/ai/conversational_handler";
import { ActionRecord } from "@/lib/types";
import { nanoid } from "@/lib/integrations/util";
import { createRefund } from "@/lib/integrations/sponge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let payload: unknown = {};
  let parseError: string | null = null;
  try {
    payload = await req.json();
  } catch {
    parseError = "invalid_json";
  }

  const eventType = eventTypeOf(payload) || "agentphone.event";
  const debugEvent = await store.addWebhookEvent({
    provider: "agentphone",
    event_type: eventType,
    payload,
    parsed_kind: "unknown",
  });

  if (parseError) {
    return NextResponse.json({ ok: false, error: parseError, debug_event_id: debugEvent.id }, { status: 400 });
  }

  try {
    // ── Step 0: Check if this is an owner YES/NO command ─────────────────────
    const ownerPhone = await store.getOwnerPhone();
    if (ownerPhone) {
      const sms = normalizeInboundSMS(payload);
      if (sms && sms.from === ownerPhone) {
        const cmdMatch = sms.body.trim().match(/^(YES|NO|APPROVE|DECLINE)[·\s:]+([a-zA-Z0-9_]+)/i);
        if (cmdMatch) {
          const approved = /YES|APPROVE/i.test(cmdMatch[1]);
          const pendingId = cmdMatch[2];
          const pending = await store.getPendingOwnerAction(pendingId);

          if (!pending) {
            await sendDirectSMS({ to: ownerPhone, body: `⚠️ Couldn't find pending action "${pendingId}". It may already be resolved.` });
            return NextResponse.json({ ok: true, action: "owner_command_not_found" });
          }

          await store.resolvePendingOwnerAction(pendingId, approved ? "approved" : "declined");

          if (approved && pending.type === "approve_refund" && pending.amount_cents) {
            // Execute the refund now
            const c = (await store.listCustomers()).find(x => x.id === pending.customer_id);
            await createRefund({ customerId: pending.customer_id, amountCents: pending.amount_cents, reason: "Owner approved via SMS" });
            if (c?.phone) {
              await sendDirectSMS({ to: c.phone, body: `✅ Good news — your refund of $${(pending.amount_cents / 100).toFixed(2)} has been approved and is on its way!` });
            }
            await sendDirectSMS({ to: ownerPhone, body: `✅ Done — refunded $${(pending.amount_cents / 100).toFixed(2)} to ${c?.name ?? "customer"}.` });
          } else if (!approved) {
            const c = (await store.listCustomers()).find(x => x.id === pending.customer_id);
            if (c?.phone) {
              await sendDirectSMS({ to: c.phone, body: `Thanks for reaching out. We've reviewed your request and unfortunately can't accommodate it this time. Feel free to reply if you have questions.` });
            }
            await sendDirectSMS({ to: ownerPhone, body: `👍 Noted — declined. ${c?.name ?? "Customer"} has been notified.` });
          } else {
            await sendDirectSMS({ to: ownerPhone, body: `✅ Got it — marked as ${approved ? "approved" : "declined"}.` });
          }

          return NextResponse.json({ ok: true, action: "owner_command_executed", approved, pending_id: pendingId });
        }
      }
    }

    // ── Step 1: Ingest ────────────────────────────────────────────────────────
    const ingest = await ingestAgentPhoneWebhook(payload);
    await store.updateWebhookEvent(debugEvent.id, {
      parsed_kind: ingest.parsed_kind,
      inserted_message_id: ingest.message?.id,
    });

    if (!ingest.inserted || !ingest.message || !ingest.customer) {
      // Duplicate or unrecognised payload — still 200 so the provider doesn't retry.
      return NextResponse.json({ ...ingest, debug_event_id: debugEvent.id });
    }

    const message  = ingest.message;
    const customer = ingest.customer;

    // ── Step 2: Conversational + decision processing ──────────────────────────
    // Uses full conversation history for natural multi-turn dialogue.
    // Falls back to single-turn if history fetch fails.
    const policies = await store.getPolicies();
    await store.updateMessageStatus(message.id, "processing");

    const convId = message.metadata?.agentphone?.conversationId;
    const result = await handleConversationalMessage({
      message,
      customer,
      policies,
      conversationId: convId,
      managerName: "Opelo",
    });

    // ── Step 3: Persist action record ────────────────────────────────────────
    const record: ActionRecord = {
      id: nanoid("act"),
      message_id: message.id,
      customer_id: customer.id,
      classification: result.classification,
      decision: result.decision,
      policy_applied: result.policy_applied,
      reasoning_summary: result.reasoning_summary,
      customer_response: result.customer_response,
      owner_summary: result.owner_summary,
      action_type: result.action_type,
      mock_external_actions: result.mock_external_actions,
      revenue_delta: result.revenue_delta,
      counter_offer: result.counter_offer,
      llm_used: result.llm_used,
      created_at: new Date().toISOString(),
    };
    await store.addAction(record);
    await store.updateMessageStatus(message.id, "handled");

    return NextResponse.json({
      ok: true,
      parsed_kind: ingest.parsed_kind,
      customer_id: customer.id,
      message_id: message.id,
      action_id: record.id,
      decision: result.decision,
      classification: result.classification,
      llm_used: result.llm_used,
      external_actions: result.mock_external_actions.map(a => ({ name: a.name, ok: a.ok })),
      debug_event_id: debugEvent.id,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    await store.updateWebhookEvent(debugEvent.id, { parsed_kind: "unknown" });
    // Return 200 so the provider doesn't retry — log the error internally.
    console.error("[agentphone/webhook]", msg);
    return NextResponse.json({ ok: false, error: msg, debug_event_id: debugEvent.id });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "agentphone.webhook",
    accepts: "POST application/json",
    auto_processes: true,
    debug: "/api/agentphone/debug",
  });
}
