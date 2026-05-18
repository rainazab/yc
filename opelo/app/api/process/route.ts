import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/db/store";
import { processInboundMessage } from "@/lib/ai/manager";
import { ActionRecord } from "@/lib/types";
import { nanoid } from "@/lib/integrations/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const messageId: string | undefined = body.message_id;
    const useLLM: boolean = body.use_llm !== false;
    const managerName: string | undefined =
      typeof body.manager_name === "string" ? body.manager_name : undefined;

    if (!messageId) {
      return NextResponse.json(
        { error: "message_id required" },
        { status: 400 },
      );
    }

    const message = await store.getMessage(messageId);
    if (!message) {
      return NextResponse.json({ error: "message not found" }, { status: 404 });
    }
    const customer = await store.getCustomer(message.customer_id);
    if (!customer) {
      return NextResponse.json(
        { error: "customer not found" },
        { status: 404 },
      );
    }
    const policies = await store.getPolicies();

    await store.updateMessageStatus(messageId, "processing");
    const result = await processInboundMessage(message, policies, customer, {
      useLLM,
      managerName,
    });

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
    await store.updateMessageStatus(messageId, "handled");

    // Reflect the decision in the company wallet so the cockpit can show
    // available balance and refunded-today move in real time.
    let wallet = await store.getWallet();
    if (result.action_type === "refund_issued") {
      const amountDollars =
        result.detected_amount ?? Math.abs(result.revenue_delta ?? 0);
      if (amountDollars > 0) {
        wallet = await store.applyRefund(Math.round(amountDollars * 100));
      }
    } else if (
      result.action_type === "discount_offered" ||
      result.action_type === "sponsorship_countered"
    ) {
      const pipelineDollars = result.counter_offer ?? 0;
      if (pipelineDollars > 0) {
        wallet = await store.applyPaymentLinkCreated(
          Math.round(pipelineDollars * 100),
        );
      }
    } else if (result.revenue_delta > 0) {
      // Confirmed new revenue (accepted project, auto-booked lead).
      wallet = await store.applyRevenueGenerated(
        Math.round(result.revenue_delta * 100),
      );
    }

    return NextResponse.json({ ok: true, result, action: record, wallet });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
