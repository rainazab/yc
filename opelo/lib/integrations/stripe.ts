/**
 * Stripe payment links — for customers to pay businesses via card.
 *
 * This is what your CUSTOMERS use when Opelo asks them to pay.
 * (Sponge is for agent-to-agent crypto transfers; Stripe is for real people
 *  paying with a credit or debit card.)
 *
 * Setup:
 *  1. Sign up at stripe.com (free, pay-per-transaction: 2.9% + 30¢)
 *  2. Get your secret key from dashboard.stripe.com/apikeys
 *  3. Add STRIPE_SECRET_KEY to .env.local
 *  4. Optionally add STRIPE_WEBHOOK_SECRET after setting up the webhook
 *
 * Demo amounts are capped at $0.50 when NEXT_PUBLIC_DEMO_MODE=true.
 */

import { MockExternalAction } from "../types";
import { nanoid } from "./util";

const DEMO_CAP_USD = 0.5; // $0.50 max in demo mode

export interface StripePaymentLinkResult {
  id: string;
  url: string;
  amount_cents: number;
  capped: boolean;
  mode: "live" | "mock";
}

function stripeKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY?.trim();
}

function inMockMode(): boolean {
  return !stripeKey();
}

/**
 * Create a Stripe Payment Link so a customer can pay by card.
 * Requires STRIPE_SECRET_KEY in .env.local.
 */
export async function createStripePaymentLink(input: {
  amountCents: number;
  description: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}): Promise<StripePaymentLinkResult> {
  const fallback: StripePaymentLinkResult = {
    id: nanoid("stpl"),
    url: `https://buy.stripe.com/demo_${nanoid("demo")}`,
    amount_cents: input.amountCents,
    capped: false,
    mode: "mock",
  };

  if (inMockMode()) return fallback;

  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const capped  = isDemo && input.amountCents > Math.round(DEMO_CAP_USD * 100);
  const cents   = capped ? Math.round(DEMO_CAP_USD * 100) : input.amountCents;
  const desc    = capped
    ? `${input.description} [demo — $${(cents / 100).toFixed(2)}]`
    : input.description;

  try {
    // Step 1: create a Price (Stripe requires a price object)
    const priceBody = new URLSearchParams({
      "currency": "usd",
      "unit_amount": String(cents),
      "product_data[name]": desc.slice(0, 500),
    });
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        priceBody.append(`product_data[metadata][${k}]`, v);
      }
    }

    const priceResp = await fetch("https://api.stripe.com/v1/prices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: priceBody.toString(),
    });

    if (!priceResp.ok) {
      const err = await priceResp.text();
      console.error("[stripe] price creation failed:", err.slice(0, 200));
      return { ...fallback, mode: "mock" };
    }

    const price = await priceResp.json() as { id: string };

    // Step 2: create the Payment Link
    const linkBody = new URLSearchParams({
      "line_items[0][price]": price.id,
      "line_items[0][quantity]": "1",
    });
    if (input.customerEmail) {
      linkBody.append("customer_creation", "always");
    }
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        linkBody.append(`metadata[${k}]`, v);
      }
    }

    const linkResp = await fetch("https://api.stripe.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: linkBody.toString(),
    });

    if (!linkResp.ok) {
      const err = await linkResp.text();
      console.error("[stripe] payment link creation failed:", err.slice(0, 200));
      return { ...fallback, mode: "mock" };
    }

    const link = await linkResp.json() as { id: string; url: string };
    return { id: link.id, url: link.url, amount_cents: cents, capped, mode: "live" };

  } catch (err) {
    console.error("[stripe] error:", err);
    return { ...fallback, mode: "mock" };
  }
}

export function toMockExternalAction(
  result: StripePaymentLinkResult,
  detail: string,
): MockExternalAction {
  return {
    name: result.mode === "live"
      ? (result.capped ? "stripe.payment_link.created.demo_capped" : "stripe.payment_link.created")
      : "stripe.mock.payment_link.created",
    ok: true,
    ref: result.id,
    detail,
  };
}
