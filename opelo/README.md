# Opelo

AI middle management for one-person businesses. Delegate operational
judgment — refunds, pricing exceptions, sponsorships, scheduling, and
escalations — to an AI manager that follows your business policies.

## Quick start

```sh
npm install
npm run dev
# open http://localhost:3000
```

Opelo runs entirely in demo/mock mode without any API keys. Drop keys into
`.env.local` (see `.env.local.example`) to turn live providers on. There is
no auth, no signup, and no protected routes.

## Developer testing

### Inbound email (AgentMail)

```sh
# Insert a fake live email (random fixture)
curl -X POST http://localhost:3000/api/agentmail/test

# Replay a real-shaped AgentMail webhook
curl -X POST http://localhost:3000/api/agentmail/webhook \
  -H 'Content-Type: application/json' \
  -d '{"event_type":"message.received","message":{"id":"am_1","from":"alex@example.com","subject":"Refund","text":"Refund my $82 please"}}'

# Send a real outbound email to verify wiring
curl -X POST http://localhost:3000/api/agentmail/send-test \
  -H 'Content-Type: application/json' \
  -d '{"to":"you@gmail.com","subject":"Hi","text":"Test"}'
```

### Inbound SMS (AgentPhone)

```sh
# Insert a fake live SMS (default Jordan $1,500 / $3,000 pricing)
curl -X POST http://localhost:3000/api/agentphone/test

# Insert a fake call transcript
curl -X POST http://localhost:3000/api/agentphone/test-call

# Replay a real-shaped AgentPhone SMS webhook
curl -X POST http://localhost:3000/api/agentphone/webhook \
  -H 'Content-Type: application/json' \
  -d '{"event":"sms.received","data":{"message":{"id":"ap_1","from":"+15551234567","body":"Refund $40 please"}}}'

# Inspect ALL recent AgentPhone webhook payloads exactly as received
curl http://localhost:3000/api/agentphone/debug | python3 -m json.tool

# Probe AgentPhone for the right send-SMS path on your tenant
curl http://localhost:3000/api/agentphone/probe | python3 -m json.tool

# Send a real outbound SMS to verify wiring
curl -X POST http://localhost:3000/api/agentphone/send-test \
  -H 'Content-Type: application/json' \
  -d '{"to":"+15551234567","body":"Opelo test"}'
```

### Hook AgentPhone / AgentMail to real webhooks

Real inbound to localhost needs a public tunnel:

```sh
ngrok http 3000
```

Set the AgentMail webhook URL to:

```
https://YOUR-NGROK-URL/api/agentmail/webhook
```

Set the AgentPhone webhook URL to:

```
https://YOUR-NGROK-URL/api/agentphone/webhook
```

Both endpoints save every raw payload to the debug feed before parsing, so a
webhook that doesn't surface in the cockpit will still appear in
`/api/agentphone/debug` (or `agentmail` provider). That's the first place to
look when "I texted the number and nothing happened."

### Reset the demo

```sh
curl -X POST http://localhost:3000/api/seed
# or: rm -rf .opelo-data
```

## Env vars

See `.env.local.example`. Notable overrides:

- `GEMINI_API_KEY` — primary LLM for decisioning (preferred over OpenAI /
  Anthropic when present)
- `AGENTPHONE_SEND_PATH` — override the outbound SMS path if your AgentPhone
  tenant uses something other than `/sms/send`
- `AGENTMAIL_INBOX_ID` — required for live AgentMail send

## Architecture

- `app/page.tsx` — the single cockpit page (no Logs tab, no auth)
- `app/api/process` — runs an inbound message through the AI manager
- `app/api/agentmail/*` and `app/api/agentphone/*` — provider webhooks +
  test/debug routes
- `lib/ai/manager.ts` — deterministic decision engine + LLM enhancement
- `lib/ai/gemini.ts` — Gemini integration (primary)
- `lib/integrations/{agentmail,agentphone,sponge,calendar,supermemory}.ts`
  — provider wrappers. Each one returns a `MockExternalAction` so the
  cockpit can render success/failure consistently across real and mock
  modes.
