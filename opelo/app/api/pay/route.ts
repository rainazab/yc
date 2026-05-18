import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/db/store";
import { createStripePaymentLink } from "@/lib/integrations/stripe";
import { createSpongeMcpPaymentLink } from "@/lib/integrations/sponge_mcp";
import { nanoid } from "@/lib/integrations/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pay
 * Creates a unified dual-rail payment link (Stripe card + Sponge crypto).
 * Returns a /pay/[id] URL that shows both options on a branded page.
 */
export async function POST(req: NextRequest) {
  try {
    const { action_id, customer_id, description, amount_cents } =
      await req.json().catch(() => ({})) as {
        action_id?: string;
        customer_id?: string;
        description?: string;
        amount_cents?: number;
      };

    if (!description || !amount_cents) {
      return NextResponse.json({ error: "description and amount_cents required" }, { status: 400 });
    }

    const id            = nanoid("pay");
    const business_name = await store.getBusinessName();

    // Create both payment options in parallel
    const [stripeResult, spongeResult] = await Promise.allSettled([
      createStripePaymentLink({ amountCents: amount_cents, description }),
      createSpongeMcpPaymentLink({ description, amountUsd: amount_cents / 100 }),
    ]);

    const stripeUrl = stripeResult.status === "fulfilled" && stripeResult.value.mode === "live"
      ? stripeResult.value.url : undefined;
    const spongeUrl = spongeResult.status === "fulfilled"
      ? spongeResult.value.url : undefined;

    const link = await store.savePaymentLink({
      id,
      action_id: action_id ?? "",
      customer_id: customer_id ?? "",
      business_name,
      description,
      amount_cents,
      stripe_url: stripeUrl,
      sponge_url: spongeUrl,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    // Build the public /pay/[id] URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (req.headers.get("x-forwarded-host")
        ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("x-forwarded-host")}`
        : "http://localhost:3000");

    return NextResponse.json({
      ok: true,
      pay_url: `${baseUrl}/pay/${id}`,
      id,
      stripe_url: stripeUrl,
      sponge_url: spongeUrl,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status: 500 });
  }
}
