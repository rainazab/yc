/**
 * GET /api/agentphone/poll
 * Polls AgentPhone for new messages and processes any not yet handled by Opelo.
 * Works without a public webhook URL — great for demos and offline-first use.
 *
 * Call every 10-15 seconds:
 *   setInterval(() => fetch('/api/agentphone/poll'), 10000)
 */
import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";
import { handleConversationalMessage } from "@/lib/ai/conversational_handler";
import { ActionRecord } from "@/lib/types";
import { nanoid } from "@/lib/integrations/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.AGENTPHONE_BASE_URL ?? "https://api.agentphone.ai/v1";
const KEY  = process.env.AGENTPHONE_API_KEY ?? "";

interface ApMessage {
  id: string;
  body: string;
  fromNumber: string;
  toNumber: string;
  direction: "inbound" | "outbound";
  channel: string;
  receivedAt: string;
}

interface ApConversation {
  id: string;
  phoneNumber: string;
  participant: string;
  lastMessageAt: string;
  messageCount: number;
}

export async function GET() {
  if (!KEY) return NextResponse.json({ ok: false, reason: "no AGENTPHONE_API_KEY" });

  try {
    // 1. Fetch conversations active in the last 60 minutes
    const convResp = await fetch(`${BASE}/conversations?limit=20`, {
      headers: { Authorization: `Bearer ${KEY}` },
      cache: "no-store",
    });
    if (!convResp.ok) return NextResponse.json({ ok: false, reason: `conv fetch ${convResp.status}` });

    const conversations = ((await convResp.json()) as { data: ApConversation[] }).data ?? [];
    const cutoff        = Date.now() - 60 * 60 * 1000; // 60 min window

    const processed: string[] = [];
    const skipped:   string[] = [];

    for (const conv of conversations) {
      if (new Date(conv.lastMessageAt).getTime() < cutoff) { skipped.push(conv.id); continue; }

      // 2. Fetch all messages with a large limit so we don't miss recent ones
      const msgResp = await fetch(`${BASE}/conversations/${conv.id}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${KEY}` },
        cache: "no-store",
      });
      if (!msgResp.ok) continue;

      const allMessages: ApMessage[] = ((await msgResp.json()) as { data: ApMessage[] }).data ?? [];

      // Sort oldest-first so we process in order
      const inbound = allMessages
        .filter(m => m.direction === "inbound" && m.body?.trim())
        .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

      if (inbound.length === 0) { skipped.push(conv.id); continue; }

      // 3. Find the LATEST inbound message that hasn't been processed yet
      const existingMessages = await store.listMessages();
      const storedSourceIds  = new Set(existingMessages.map(m => m.source_id).filter(Boolean));
      const storedPollIds    = new Set(existingMessages.map(m => m.id));

      // Work through messages newest-first, find the first unprocessed one
      const unprocessed = inbound
        .reverse() // newest first
        .find(m => !storedSourceIds.has(m.id) && !storedPollIds.has(`msg_poll_${m.id.slice(-16)}`));

      if (!unprocessed) { skipped.push(conv.id); continue; }

      // 4. Upsert customer
      const phoneSlug  = conv.participant.replace(/[^a-zA-Z0-9_+-]/g, "_");
      const customerId = `cus_live_${phoneSlug}`;
      await store.upsertCustomer({
        id: customerId, name: conv.participant, email: "",
        phone: conv.participant, vip: false, prior_refunds: 0,
        lifetime_value: 0, created_at: new Date().toISOString(),
      });

      // 5. Store the message
      const msgId   = `msg_poll_${unprocessed.id.slice(-16)}`;
      const message = {
        id: msgId,
        customer_id: customerId,
        channel: "sms" as const,
        subject: `iMessage from ${conv.participant}`,
        body: unprocessed.body.trim(),
        received_at: unprocessed.receivedAt,
        status: "new" as const,
        source_id: unprocessed.id,
        metadata: {
          agentphone: {
            conversationId: conv.id,
            numberId:       process.env.AGENTPHONE_NUMBER_ID,
            channel:        "imessage" as const,
          },
        },
      };

      const { inserted } = await store.addMessage(message);
      if (!inserted) { skipped.push(conv.id); continue; }

      // 6. Process through Opelo AI
      const customer = (await store.listCustomers()).find(c => c.id === customerId);
      if (!customer) continue;

      const policies = await store.getPolicies();
      await store.updateMessageStatus(msgId, "processing");

      const result = await handleConversationalMessage({
        message, customer, policies,
        conversationId: conv.id,
        managerName: "Opelo",
      });

      const record: ActionRecord = {
        id: nanoid("act"), message_id: msgId, customer_id: customerId,
        classification: result.classification, decision: result.decision,
        policy_applied: result.policy_applied, reasoning_summary: result.reasoning_summary,
        customer_response: result.customer_response, owner_summary: result.owner_summary,
        action_type: result.action_type, mock_external_actions: result.mock_external_actions,
        revenue_delta: result.revenue_delta, counter_offer: result.counter_offer,
        llm_used: result.llm_used, created_at: new Date().toISOString(),
      };

      await store.addAction(record);
      await store.updateMessageStatus(msgId, "handled");
      processed.push(`${conv.participant}: "${unprocessed.body.slice(0, 40)}" → ${result.decision}`);
    }

    return NextResponse.json({
      ok: true,
      checked: conversations.length,
      processed: processed.length,
      skipped: skipped.length,
      results: processed,
    });

  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "error" });
  }
}
