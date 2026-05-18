import { Policies } from "./types";
import { store } from "./db/store";

export async function getPolicies(): Promise<Policies> {
  return store.getPolicies();
}

export async function savePolicies(input: Partial<Policies>): Promise<Policies> {
  const current = await store.getPolicies();
  const next: Policies = {
    refund_auto_approve_under: clampNumber(
      input.refund_auto_approve_under ?? current.refund_auto_approve_under,
      0,
      1_000_000,
    ),
    min_sponsorship_price: clampNumber(
      input.min_sponsorship_price ?? current.min_sponsorship_price,
      0,
      1_000_000,
    ),
    min_project_price: clampNumber(
      input.min_project_price ?? current.min_project_price,
      0,
      1_000_000,
    ),
    vip_customers: dedupe(input.vip_customers ?? current.vip_customers),
    escalation_keywords: dedupe(
      input.escalation_keywords ?? current.escalation_keywords,
    ).map((s) => s.toLowerCase()),
    booking_availability:
      (input.booking_availability ?? current.booking_availability).slice(
        0,
        500,
      ),
    auto_book_lead_above: clampNumber(
      input.auto_book_lead_above ?? current.auto_book_lead_above,
      0,
      10_000_000,
    ),
  };
  return store.setPolicies(next);
}

function clampNumber(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Number(n)));
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const t = s.trim();
    if (!t) continue;
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}
