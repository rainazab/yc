import {
  ActionRecord,
  CompanyWallet,
  Customer,
  InboundMessage,
  Policies,
} from "../types";

export function defaultPolicies(): Policies {
  return {
    refund_auto_approve_under: 100,
    min_sponsorship_price: 2000,
    min_project_price: 2500,
    vip_customers: ["acme@vip.co"],
    escalation_keywords: [
      "ridiculous",
      "lawyer",
      "lawsuit",
      "chargeback",
      "scam",
      "refund now",
      "unacceptable",
      "third time",
      "three times",
      "messaged three times",
      "nobody has answered",
      "frustrated",
    ],
    booking_availability:
      "Tuesdays and Thursdays, 10am–4pm PT. 30-min intro or 60-min working session.",
    auto_book_lead_above: 5000,
  };
}

export function seedCustomers(): Customer[] {
  const now = new Date().toISOString();
  // Kept slim for the live demo: 2 history customers so the operational feed
  // has visible activity, plus 2 fallback customers in case the live
  // AgentMail/AgentPhone integrations hiccup. Everything else is removed so
  // the inbox doesn't compete with real inbound.
  return [
    {
      id: "cus_alex",
      name: "Alex",
      email: "alex@example.com",
      vip: false,
      prior_refunds: 0,
      lifetime_value: 82,
      created_at: now,
    },
    {
      id: "cus_dtc",
      name: "DTC Founder",
      email: "founder@dtcbrand.com",
      vip: false,
      prior_refunds: 0,
      lifetime_value: 0,
      created_at: now,
    },
    {
      id: "cus_seed_priya",
      name: "Priya",
      email: "priya@example.com",
      vip: false,
      prior_refunds: 0,
      lifetime_value: 49,
      created_at: now,
    },
    {
      id: "cus_seed_oakwave",
      name: "OakWave Snacks",
      email: "partnerships@oakwave.io",
      vip: false,
      prior_refunds: 0,
      lifetime_value: 0,
      created_at: now,
    },
  ];
}

export function seedMessages(): InboundMessage[] {
  const base = Date.now();
  const earlier = (mins: number) =>
    new Date(base - mins * 60 * 1000).toISOString();
  return [
    // Two already-handled workflows so the operational feed has visible
    // history when the cockpit loads.
    {
      id: "msg_seed_refund_handled",
      customer_id: "cus_seed_priya",
      channel: "email",
      subject: "Refund request — creator course",
      body: "Hi! I bought your $49 starter pack last week and it just isn't a fit for me. Could I get a refund?",
      received_at: earlier(112),
      status: "handled",
      amount_hint: 49,
    },
    {
      id: "msg_seed_sponsor_handled",
      customer_id: "cus_seed_oakwave",
      channel: "email",
      subject: "Sponsorship — $500 for next video",
      body: "Hi! We'd love to sponsor your next video for $500. 30s mid-roll integration, link in description.",
      received_at: earlier(54),
      status: "handled",
      amount_hint: 500,
    },
    // Two fallback workflows in case the live AgentMail / AgentPhone
    // integrations hiccup mid-demo. Everything else lands via real webhooks.
    {
      id: "msg_refund_001",
      customer_id: "cus_alex",
      channel: "email",
      subject: "Refund request for creator course",
      body: "Hey, I bought your creator course yesterday but it wasn't what I expected. Can I get a refund? It was $82.",
      received_at: earlier(8),
      status: "new",
      amount_hint: 82,
    },
    {
      id: "msg_lead_004",
      customer_id: "cus_dtc",
      channel: "phone_transcript",
      subject: "Phone call transcript — AI workflow build",
      body: "Hi, I run a fast-growing DTC brand and need help building an AI customer support workflow. Budget is around $8k. Are you available next week?",
      received_at: earlier(2),
      status: "new",
      amount_hint: 8000,
    },
  ];
}

export function seedActions(): ActionRecord[] {
  const base = Date.now();
  const earlier = (mins: number) =>
    new Date(base - mins * 60 * 1000).toISOString();
  return [
    {
      id: "act_seed_refund",
      message_id: "msg_seed_refund_handled",
      customer_id: "cus_seed_priya",
      classification: "refund_request",
      decision: "approve",
      policy_applied: "Auto-approve refunds under $100",
      reasoning_summary:
        "Refund of $49 fell under the auto-approve threshold and Priya had no prior refunds.",
      customer_response:
        "Thanks for the note, Priya — I've issued your $49 refund. You should see it on your statement within a few business days. Any feedback on what didn't land would mean a lot.",
      owner_summary: "Approved a $49 refund under your auto-refund policy.",
      action_type: "refund_issued",
      mock_external_actions: [
        {
          name: "sponge.mock.refund.created",
          ok: true,
          ref: "re_seed_priya49",
          detail: "Refunded $49.00 to priya@example.com via Sponge.",
        },
        {
          name: "agentmail.reply",
          ok: true,
          ref: "am_seed_priya",
          detail: "Replied to priya@example.com — 'Re: Refund request — creator course'.",
        },
        {
          name: "agentphone.mock.sms.owner_update.sent",
          ok: true,
          ref: "ap_seed_owner_refund",
          detail:
            "SMS to owner +15555550123: Opelo: Approved a $49 refund under your auto-refund policy.",
        },
        {
          name: "supermemory.mock.decision.saved",
          ok: true,
          ref: "mem_seed_refund",
          detail: "Saved decision to Opelo Demo Studio memory.",
        },
      ],
      revenue_delta: -49,
      llm_used: false,
      created_at: earlier(110),
    },
    {
      id: "act_seed_sponsor",
      message_id: "msg_seed_sponsor_handled",
      customer_id: "cus_seed_oakwave",
      classification: "sponsorship_offer",
      decision: "negotiate",
      policy_applied: "Reject sponsorships under $2000; counter to floor",
      reasoning_summary:
        "OakWave's $500 offer was below your $2,000 floor — countered at the floor with the same deliverables.",
      customer_response:
        "Thanks so much for reaching out — really like OakWave. The package you're describing typically lands at $2,000, which covers a 30-second integration plus a short-form repost. Happy to lock that in if it works.",
      owner_summary: "Countered a $500 sponsorship to your $2,000 floor.",
      action_type: "sponsorship_countered",
      mock_external_actions: [
        {
          name: "sponge.mock.payment_link.created",
          ok: true,
          ref: "plink_seed_oakwave",
          detail:
            "Payment link for $2,000 → https://pay.sponge.demo/plink_seed_oakwave",
        },
        {
          name: "agentmail.reply",
          ok: true,
          ref: "am_seed_oakwave",
          detail:
            "Replied to partnerships@oakwave.io — 'Re: Sponsorship — $500 for next video'.",
        },
        {
          name: "agentphone.mock.sms.owner_update.sent",
          ok: true,
          ref: "ap_seed_owner_sponsor",
          detail:
            "SMS to owner +15555550123: Opelo: Countered a $500 sponsorship to your $2,000 floor.",
        },
        {
          name: "supermemory.mock.decision.saved",
          ok: true,
          ref: "mem_seed_sponsor",
          detail: "Saved decision to Opelo Demo Studio memory.",
        },
      ],
      revenue_delta: 0,
      counter_offer: 2000,
      llm_used: false,
      created_at: earlier(52),
    },
  ];
}

export function seedWallet(): CompanyWallet {
  // Available reflects the studio's cash on hand; refunded_today is pre-loaded
  // with the seeded $49 Priya refund so the metric already has history.
  return {
    available_cents: 1_842_300,
    pending_cents: 96_400,
    refunded_today_cents: 4_900,
    revenue_generated_today_cents: 0,
    currency: "USD",
    updated_at: new Date().toISOString(),
  };
}

export function seedPendingInbound(): InboundMessage[] {
  // Empty for the live demo — real inbound arrives via AgentMail /
  // AgentPhone webhooks instead. To re-enable the simulated drip during
  // development, add InboundMessage entries here.
  return [];
}
