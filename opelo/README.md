# Opelo

**AI middle management for one-person businesses.**

Opelo is an AI agent that runs your business operations so you can focus on your work. Customers text or call your number — Opelo handles the conversation, makes a decision based on your rules, and takes action — all without bothering you.

---

## What Opelo does

When a customer reaches out, Opelo:

- **Approves or declines refunds** under your threshold automatically
- **Books meetings** with qualified leads based on your availability
- **Holds your pricing floor** and counter-offers sponsorships or project discounts
- **Escalates** tricky situations to you by text, with a YES/NO reply to resolve them
- **Responds in the customer's language** — Gemini detects and replies in Spanish, French, Portuguese, etc.
- **Sends a call summary** after every phone conversation so you always know what happened

Everything is logged. Nothing slips through.

---

## How it works

```
Customer texts or calls your number (iMessage / SMS / phone)
        ↓
AgentPhone receives the message and notifies Opelo
        ↓
Opelo reads your business rules and past context
        ↓
Gemini 2.5 Flash makes a decision
        ↓
Opelo replies to the customer + takes action (refund, booking, payment link)
        ↓
You get a text summary — reply YES/NO if anything needs your input
```

---

## Tech stack

| Layer | What |
|---|---|
| **AI** | Gemini 2.5 Flash (primary), OpenAI / Anthropic (fallback) |
| **Voice & SMS** | AgentPhone (iMessage + SMS + calls) |
| **Email** | AgentMail |
| **Card payments** | Stripe |
| **Crypto payments** | Sponge (USDC on Solana / Base) |
| **Memory** | Supermemory |
| **Calendar** | Google Calendar |
| **Framework** | Next.js 14, TypeScript, Tailwind |

Payment links show both options on a single page — customer picks card or crypto.

---

## Running locally

```sh
cd opelo
npm install
npm run dev
# → http://localhost:3000
```

Works in demo mode without any API keys. Add keys to `.env.local` to go live.

---

## Getting started as a business owner

1. Go to `/get-started` and describe your business in plain English
2. Opelo sets up your rules automatically
3. Share your AgentPhone number with customers
4. Watch the dashboard — Opelo handles the rest

---

## Key env vars

Copy `.env.local.example` to `.env.local` and fill in what you need:

| Key | What it enables |
|---|---|
| `GEMINI_API_KEY` | Live AI decisions (required for best results) |
| `AGENTPHONE_API_KEY` | Real iMessage / SMS / call handling |
| `AGENTPHONE_AGENT_ID` | Links messages to your Opelo agent |
| `AGENTPHONE_NUMBER_ID` | Required for shared-imessage replies |
| `AGENTMAIL_API_KEY` | Live email replies |
| `STRIPE_SECRET_KEY` | Real card payment links |
| `SPONGE_API_KEY` | Real crypto payment links |
| `OWNER_PHONE_NUMBER` | Where Opelo texts you for escalations |

Set `NEXT_PUBLIC_DEMO_MODE=false` to disable the demo cap on payment amounts.

---

## Testing without a real phone

```sh
# Simulate an inbound SMS
curl -X POST http://localhost:3000/api/agentphone/test

# Simulate a phone call transcript
curl -X POST http://localhost:3000/api/agentphone/test-call \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"I want a refund for the $45 course","caller_name":"Alex"}'

# Reset to demo data
curl -X POST http://localhost:3000/api/seed
```

---

## Polling (no-tunnel fallback)

If you can't expose a public webhook URL, Opelo can poll for new messages:

```sh
# Check for new messages every 10 seconds
watch -n 10 curl -s http://localhost:3000/api/agentphone/poll
```

This works offline — no ngrok required.
