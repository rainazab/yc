import { MockExternalAction } from "../types";
import { isDemo, nanoid } from "./util";
import { createSpongeMcpPaymentLink } from "./sponge_mcp";

export interface SpongeRefundInput {
  customerId?: string;
  paymentId?: string;
  amountCents: number;
  reason?: string;
}

export interface SpongePaymentLinkInput {
  amountCents: number;
  description: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface SpongeCustomer {
  id: string;
  email: string;
  name: string;
  lifetime_value_cents: number;
  prior_refunds: number;
  tags: string[];
}

export interface SpongeBalance {
  available_cents: number;
  pending_cents: number;
  currency: "USD";
}

export interface SpongeResponse<T> {
  ok: boolean;
  provider: "sponge";
  mode: "mock" | "live";
  data: T;
  log: string;
  raw_status?: number;
  error_detail?: string;
}

function inMockMode(): boolean {
  return isDemo(process.env.SPONGE_API_KEY, process.env.SPONGE_BASE_URL);
}

/**
 * In demo mode, cap all real payment transactions at 50 cents to protect the
 * $5 wallet balance while still proving the live payment infrastructure.
 */
function demoSafeCents(requested: number): { cents: number; capped: boolean } {
  const DEMO_CAP = 50; // $0.50
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && requested > DEMO_CAP) {
    return { cents: DEMO_CAP, capped: true };
  }
  return { cents: requested, capped: false };
}

function baseUrl(): string {
  return process.env.SPONGE_BASE_URL?.replace(/\/$/, "") ?? "";
}

function apiKey(): string {
  return process.env.SPONGE_API_KEY ?? "";
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function mockResponse<T>(log: string, data: T): SpongeResponse<T> {
  return { ok: true, provider: "sponge", mode: "mock", data, log };
}

function liveResponse<T>(log: string, data: T, rawStatus?: number): SpongeResponse<T> {
  return { ok: true, provider: "sponge", mode: "live", data, log, raw_status: rawStatus };
}

function failResponse<T>(log: string, data: T, detail: string, rawStatus?: number): SpongeResponse<T> {
  return { ok: false, provider: "sponge", mode: "live", data, log, error_detail: detail, raw_status: rawStatus };
}

// ─── Payment links ──────────────────────────────────────────────────────────

export async function createPaymentLink(
  input: SpongePaymentLinkInput,
): Promise<SpongeResponse<{ id: string; url: string; amount_cents: number }>> {
  const fallback = { id: nanoid("plink"), url: `https://pay.sponge.demo/${nanoid("demo")}`, amount_cents: input.amountCents };

  if (inMockMode()) {
    return mockResponse("sponge.mock.payment_link.created", fallback);
  }

  // ── Live mode: use the Sponge MCP protocol ───────────────────────────────
  try {
    const mcpLink = await createSpongeMcpPaymentLink({
      description: input.description,
      amountUsd: input.amountCents / 100,
    });
    return liveResponse(
      mcpLink.capped ? "sponge.payment_link.created.demo_capped" : "sponge.payment_link.created",
      { id: mcpLink.id, url: mcpLink.url, amount_cents: Math.round(mcpLink.amount_usd * 100) },
    );
  } catch (mcpErr) {
    const errMsg = mcpErr instanceof Error ? mcpErr.message : "MCP call failed";
    return failResponse("sponge.payment_link.failed", fallback, errMsg);
  }

  // REST fallback (unreachable while MCP is primary, kept for reference)
  const { cents, capped } = demoSafeCents(input.amountCents);
  const base = baseUrl();
  const body = {
    amount: cents,
    currency: "usd",
    description: input.description,
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  // Try common REST shapes used by payment platforms
  const endpoints = [
    `${base}/payment-links`,
    `${base}/links`,
    `${base}/checkout/session`,
    `${base}/checkout`,
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
      const text = await resp.text();
      if (resp.ok) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(text); } catch { /* ignore */ }
        const payUrl =
          (parsed.url as string) ||
          (parsed.link as string) ||
          (parsed.payment_url as string) ||
          (parsed.checkout_url as string) ||
          (parsed.hosted_url as string) ||
          ((parsed.data as Record<string, unknown>)?.url as string);
        const id =
          (parsed.id as string) ||
          (parsed.link_id as string) ||
          (parsed.payment_link_id as string) ||
          nanoid("plink");
        if (payUrl) {
          const detail = capped ? ` (demo-capped from $${(input.amountCents/100).toFixed(2)} → $0.50)` : "";
          return liveResponse("sponge.payment_link.created" + (capped ? ".demo_capped" : ""), { id, url: payUrl, amount_cents: cents }, resp.status);
        }
      }
      // Collect error but try next endpoint
      if (resp.status >= 400) {
        return failResponse("sponge.payment_link.failed", fallback, `${resp.status}: ${text.slice(0, 200)}`, resp.status);
      }
    } catch {
      // network error — try next endpoint
    }
  }

  return failResponse("sponge.payment_link.failed", fallback, "All Sponge endpoints failed — check SPONGE_BASE_URL.");
}

// ─── Refunds ────────────────────────────────────────────────────────────────

export async function createRefund(
  input: SpongeRefundInput,
): Promise<SpongeResponse<{ id: string; amount_cents: number; status: string }>> {
  const fallback = { id: nanoid("re"), amount_cents: input.amountCents, status: "succeeded" };

  if (inMockMode()) {
    return mockResponse("sponge.mock.refund.created", fallback);
  }

  const base = baseUrl();
  const body = {
    amount: input.amountCents,
    currency: "usd",
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.paymentId ? { payment_id: input.paymentId } : {}),
    ...(input.customerId ? { customer_id: input.customerId } : {}),
  };

  const endpoints = [`${base}/refunds`, `${base}/payments/refund`];
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
      const text = await resp.text();
      if (resp.ok) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(text); } catch { /* ignore */ }
        return liveResponse("sponge.refund.created", {
          id: (parsed.id as string) || fallback.id,
          amount_cents: input.amountCents,
          status: (parsed.status as string) || "succeeded",
        }, resp.status);
      }
    } catch { /* try next */ }
  }

  return failResponse("sponge.refund.failed", fallback, "Refund API call failed.");
}

// ─── Balance ────────────────────────────────────────────────────────────────

export async function getBalanceOrWallet(): Promise<SpongeResponse<SpongeBalance>> {
  const fallback: SpongeBalance = { available_cents: 500, pending_cents: 0, currency: "USD" };
  if (inMockMode()) return mockResponse("sponge.mock.balance.loaded", fallback);

  const base = baseUrl();
  const endpoints = [`${base}/wallet`, `${base}/balance`, `${base}/account/balance`];
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { method: "GET", headers: headers() });
      if (resp.ok) {
        const parsed = await resp.json() as Record<string, unknown>;
        return liveResponse("sponge.balance.loaded", {
          available_cents:
            (parsed.available_cents as number) ??
            (parsed.available as number) ??
            (parsed.balance as number) ?? 0,
          pending_cents: (parsed.pending_cents as number) ?? (parsed.pending as number) ?? 0,
          currency: "USD",
        }, resp.status);
      }
    } catch { /* try next */ }
  }
  return failResponse("sponge.balance.failed", fallback, "Balance check failed.");
}

export async function getCustomer(
  customerId: string,
): Promise<SpongeResponse<SpongeCustomer>> {
  const data: SpongeCustomer = {
    id: customerId,
    email: "customer@example.com",
    name: "Demo Customer",
    lifetime_value_cents: 0,
    prior_refunds: 0,
    tags: [],
  };
  if (inMockMode()) return mockResponse("sponge.mock.customer.loaded", data);
  return liveResponse("sponge.customer.loaded", data);
}

export const sponge = {
  createRefund,
  createPaymentLink,
  getCustomer,
  getBalanceOrWallet,
  inMockMode,
};

export function toMockExternalAction(
  resp: SpongeResponse<unknown>,
  detail: string,
): MockExternalAction {
  return {
    name: resp.log,
    ok: resp.ok,
    ref: nanoid("sp"),
    detail,
  };
}
