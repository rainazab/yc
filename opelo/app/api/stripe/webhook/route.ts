import { NextRequest, NextResponse } from "next/server";
import { sendDirectSMS } from "@/lib/integrations/agentphone";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe calls this after checkout.session.completed or payment_intent.succeeded.
 * We send a confirmation SMS to the customer and an alert to the owner.
 *
 * To enable:
 *  1. In Stripe Dashboard → Webhooks → Add endpoint
 *  2. URL: https://your-tunnel.loca.lt/api/stripe/webhook
 *  3. Events: checkout.session.completed, payment_intent.succeeded
 *  4. Copy the Signing Secret → STRIPE_WEBHOOK_SECRET in .env.local
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature") ?? "";

  // Signature verification (optional but recommended in production)
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (webhookSecret && sig) {
    try {
      await verifyStripeSignature(body, sig, webhookSecret);
    } catch {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventType = (event.type as string) ?? "";
  const isPaid = /checkout\.session\.completed|payment_intent\.succeeded|charge\.succeeded/.test(eventType);

  if (!isPaid) {
    return NextResponse.json({ ok: true, action: "ignored", event_type: eventType });
  }

  const data = (event.data as Record<string, unknown>)?.object as Record<string, unknown> ?? {};
  const amountCents = (data.amount_total as number) ?? (data.amount as number) ?? 0;
  const amountStr   = amountCents > 0 ? `$${(amountCents / 100).toFixed(2)}` : "";

  const customer     = (data.customer_details as Record<string, unknown>) ?? {};
  const customerEmail = (data.customer_email as string) ?? (customer.email as string) ?? "";
  const customerPhone = (customer.phone as string) ?? (data.metadata as Record<string, unknown>)?.customer_phone as string ?? "";
  const description   = (data.description as string) ?? "your purchase";

  const ownerPhone = await store.getOwnerPhone();

  const confirmMsg = `✅ Payment confirmed${amountStr ? ` (${amountStr})` : ""} for ${description}. You're all set — we'll be in touch shortly!`;
  const ownerMsg   = `💰 Payment received${amountStr ? ` ${amountStr}` : ""} from ${customerEmail || "a customer"} for: ${description}`;

  const results: string[] = [];

  // SMS to customer
  if (customerPhone) {
    const r = await sendDirectSMS({ to: customerPhone, body: confirmMsg });
    results.push(`customer_sms: ${r.ok ? "sent" : "failed"}`);
  }

  // SMS to owner
  if (ownerPhone) {
    const r = await sendDirectSMS({ to: ownerPhone, body: ownerMsg });
    results.push(`owner_sms: ${r.ok ? "sent" : "failed"}`);
  }

  return NextResponse.json({
    ok: true,
    event_type: eventType,
    amount: amountStr,
    results,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "stripe.webhook",
    events: ["checkout.session.completed", "payment_intent.succeeded"],
    setup: "Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to .env.local",
  });
}

/** Minimal Stripe webhook signature verification without the stripe npm package. */
async function verifyStripeSignature(body: string, sig: string, secret: string): Promise<void> {
  const parts = sig.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split("=");
    acc[k] = v;
    return acc;
  }, {});

  const ts = parts.t;
  const v1 = parts.v1;
  if (!ts || !v1) throw new Error("missing signature parts");

  const payload  = `${ts}.${body}`;
  const key      = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const computed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hex      = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, "0")).join("");

  if (hex !== v1) throw new Error("signature mismatch");
}
