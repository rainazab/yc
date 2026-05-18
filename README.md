# Opelo

**AI middle management for one-person businesses.**

Opelo is an AI agent that runs your business operations so you can focus on your work. Customers text or call your number — Opelo handles the conversation, makes a decision based on your rules, and takes action — all without bothering you.

---

## What Opelo does

When a customer reaches out via iMessage, SMS, or phone, Opelo:

- ✅ **Approves or declines refunds** automatically based on your threshold
- 📅 **Books meetings** with qualified leads based on your availability
- 💬 **Holds your pricing floor** and counter-offers discounts or sponsorships
- 🔔 **Escalates** edge cases to you by text — reply YES or NO to resolve them
- 🌍 **Replies in the customer's language** — Spanish, French, Portuguese, and more
- 📞 **Sends a call summary** after every phone call so nothing slips

Everything is logged. Nothing gets missed.

---

## How it works

```
Customer texts or calls your number (iMessage / SMS / voice)
        ↓
AgentPhone receives the message and notifies Opelo
        ↓
Opelo reads your business rules and past conversation context
        ↓
Gemini 2.5 Flash makes a decision
        ↓
Opelo replies to the customer + takes action (refund, booking, payment link)
        ↓
You get a text summary — reply YES·[id] or NO·[id] to override if needed
```

---

## Tech stack

| Layer | What |
|---|---|
| **AI** | Gemini 2.5 Flash (primary) · OpenAI / Anthropic (fallback) |
| **Voice & SMS** | AgentPhone (iMessage + SMS + calls) |
| **Email** | AgentMail |
| **Card payments** | Stripe |
| **Crypto payments** | Sponge (USDC on Solana / Base) |
| **Memory** | Supermemory |
| **Calendar** | Google Calendar |
| **Framework** | Next.js 14 · TypeScript · Tailwind CSS |

Payment links show both card and crypto on a single branded page — customer picks.

---

## Running locally

```sh
cd opelo
npm install
npm run dev
# → http://localhost:3000
```

Works in demo mode without any API keys. Add keys to `.env.local` (see `opelo/.env.local.example`) to go live.

---

## Getting started as a business owner

1. Open `/get-started` and describe your business in plain English
2. Opelo configures your rules automatically from your description
3. Share your AgentPhone number with customers
4. Watch the dashboard — Opelo handles the rest

---

## Key env vars

| Key | What it enables |
|---|---|
| `GEMINI_API_KEY` | Live AI decisions (recommended) |
| `AGENTPHONE_API_KEY` | Real iMessage / SMS / call handling |
| `AGENTPHONE_AGENT_ID` | Links incoming messages to your Opelo agent |
| `AGENTPHONE_NUMBER_ID` | Required for shared-imessage line replies |
| `AGENTMAIL_API_KEY` | Live email replies |
| `STRIPE_SECRET_KEY` | Real card payment links |
| `SPONGE_API_KEY` | Real crypto payment links (USDC) |
| `OWNER_PHONE_NUMBER` | Where Opelo texts you for escalations |

---

## Testing without a real phone

```sh
# Simulate an inbound SMS
curl -X POST http://localhost:3000/api/agentphone/test

# Simulate a phone call with a transcript
curl -X POST http://localhost:3000/api/agentphone/test-call \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"I want a refund for the $45 course I bought","caller_name":"Alex"}'

# Reset to demo data
curl -X POST http://localhost:3000/api/seed
```

---

## Polling (no-tunnel fallback)

Opelo can poll AgentPhone for new messages without needing a public webhook URL:

```sh
watch -n 10 curl -s http://localhost:3000/api/agentphone/poll
```

This works fully offline — no ngrok required.
