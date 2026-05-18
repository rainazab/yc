import { NextRequest, NextResponse } from "next/server";
import { sendDirectSMS } from "@/lib/integrations/agentphone";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sponge calls this after a payment link is completed.
 * We send a confirmation SMS to the customer and update internal records.
 *
 * Expected payload shapes:
 *   { event: "payment.completed", payment_link_id, customer_email, amount_cents, metadata: { customer_phone } }
 *   { type: "checkout.completed",  data: { id, amount, customer: { email, phone } } }
 */
export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Store for audit trail
  await store.addWebhookEvent({
    provider: "sponge",
    event_type: pickStr(payload, ["event", "type"]) ?? "sponge.event",
    payload,
    parsed_kind: "payment",
  }).catch(() => { /* non-fatal */ });

  const eventType = pickStr(payload, ["event", "type"]) ?? "";
  const isPaymentComplete =
    /paid|payment.*complete|checkout.*complete|succeeded/i.test(eventType);

  if (!isPaymentComplete) {
    // Other Sponge events (refund.created, etc.) — acknowledge and skip.
    return NextResponse.json({ ok: true, action: "ignored", event_type: eventType });
  }

  // Extract key fields from the payload
  const data    = isObj(payload.data) ? (payload.data as Record<string, unknown>) : payload;
  const customer = isObj(data.customer) ? (data.customer as Record<string, unknown>) : {};

  const amountCents =
    (data.amount_cents as number) ??
    (data.amount as number) ??
    (payload.amount_cents as number) ?? 0;

  const customerPhone =
    pickStr([payload, data, customer], ["customer_phone", "phone", "phone_number"]);
  const customerEmail =
    pickStr([payload, data, customer], ["customer_email", "email"]);
  const description =
    pickStr([payload, data], ["description", "product_name", "line_items.0.name"]) ??
    "your purchase";

  const amountStr = amountCents > 0 ? `$${(amountCents / 100).toFixed(2)}` : "";

  // Send confirmation SMS if we have the customer's phone number
  if (customerPhone) {
    const msg = `✅ Payment confirmed${amountStr ? ` (${amountStr})` : ""} for ${description}. Thanks — we'll be in touch shortly!`;
    const smsResult = await sendDirectSMS({ to: customerPhone, body: msg });
    return NextResponse.json({ ok: true, action: "confirmation_sms_sent", sms: smsResult, customer_phone: customerPhone });
  }

  // No phone — just acknowledge
  return NextResponse.json({
    ok: true,
    action: "payment_noted",
    amount_cents: amountCents,
    customer_email: customerEmail ?? "unknown",
    note: "No customer_phone in payload — SMS skipped. Include metadata.customer_phone when creating the payment link.",
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "sponge.webhook",
    accepts: "POST application/json",
    events: ["payment.completed", "checkout.completed"],
    tip: "Include metadata.customer_phone on payment link creation to auto-confirm via SMS.",
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function pickStr(
  containers: Record<string, unknown> | Record<string, unknown>[],
  keys: string[],
): string | undefined {
  const arr = Array.isArray(containers) ? containers : [containers];
  for (const c of arr) {
    for (const k of keys) {
      const v = c?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return undefined;
}
