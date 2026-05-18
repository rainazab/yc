import { Classification, InboundMessage, Policies } from "../types";

export interface ClassifyHints {
  classification: Classification;
  detected_amount?: number;
  is_escalation: boolean;
}

const REFUND_TERMS = ["refund", "money back", "chargeback", "return my"];
const SPONSOR_TERMS = ["sponsor", "sponsorship", "ad spot", "brand deal", "integration"];
const PRICING_TERMS = ["discount", "cheaper", "lower price", "instead of", "can you do"];
const SCHEDULE_TERMS = ["schedule", "book a call", "call next", "available", "meeting"];
const LEAD_TERMS = ["need help", "build", "looking to hire", "project", "workflow"];

function detectAmount(text: string): number | undefined {
  // Prefer the FIRST dollar amount — in negotiation-shaped messages people
  // lead with their budget ("my budget is $1,500. Can you do that instead of
  // $3,000?") and we want the customer's offer, not the listing price.
  const matches = Array.from(
    text.matchAll(/\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)(\s?[kK])?/g),
  );
  for (const m of matches) {
    const raw = m[1].replace(/,/g, "");
    let n = parseFloat(raw);
    if (m[2]) n *= 1000;
    if (Number.isFinite(n)) return n;
  }
  const kMatch = text.match(/\b([0-9]+(?:\.[0-9]+)?)\s?k\b/i);
  if (kMatch) return parseFloat(kMatch[1]) * 1000;
  return undefined;
}

function any(text: string, terms: string[]): boolean {
  const t = text.toLowerCase();
  return terms.some((w) => t.includes(w));
}

export function classifyHeuristic(
  message: InboundMessage,
  policies: Policies,
): ClassifyHints {
  const full = `${message.subject}\n${message.body}`;
  const lower = full.toLowerCase();
  const detected_amount = message.amount_hint ?? detectAmount(full);

  const escalationHit = policies.escalation_keywords.some((k) =>
    lower.includes(k.toLowerCase()),
  );

  let classification: Classification = "qualified_lead";

  if (any(lower, REFUND_TERMS)) {
    classification = "refund_request";
  } else if (any(lower, SPONSOR_TERMS)) {
    classification = "sponsorship_offer";
  } else if (any(lower, PRICING_TERMS)) {
    classification = "pricing_exception";
  } else if (
    escalationHit &&
    !any(lower, [...REFUND_TERMS, ...SPONSOR_TERMS, ...PRICING_TERMS])
  ) {
    classification = "escalation";
  } else if (any(lower, SCHEDULE_TERMS) && !any(lower, LEAD_TERMS)) {
    classification = "scheduling_request";
  } else if (any(lower, LEAD_TERMS) || (detected_amount ?? 0) >= 1000) {
    classification = "qualified_lead";
  }

  return {
    classification,
    detected_amount,
    is_escalation: escalationHit,
  };
}
