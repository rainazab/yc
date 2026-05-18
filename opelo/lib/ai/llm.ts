import Anthropic from "@anthropic-ai/sdk";
import { Classification, Decision } from "../types";
import { callGemini, geminiModelName, isGeminiAvailable } from "./gemini";
import { demoBusiness } from "../business";

export interface LlmEnhancement {
  reasoning_summary: string;
  customer_response: string;
  owner_summary: string;
  refined_classification?: Classification;
  refined_decision?: Decision;
  refined_policy_applied?: string;
}

export interface LlmInput {
  classification: Classification;
  decision: Decision;
  policy_applied: string;
  detected_amount?: number;
  customer_name: string;
  customer_email: string;
  is_vip: boolean;
  message_body: string;
  next_slot_label?: string;
  manager_name?: string;
}

export type LlmProvider = "gemini" | "openai" | "anthropic" | null;

export function detectLlmProvider(): LlmProvider {
  if (isGeminiAvailable()) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function llmModelName(provider: LlmProvider): string | null {
  if (provider === "gemini") return geminiModelName();
  if (provider === "openai") return process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (provider === "anthropic")
    return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  return null;
}

const VALID_CLASSIFICATIONS: Classification[] = [
  "refund_request",
  "pricing_exception",
  "sponsorship_offer",
  "qualified_lead",
  "scheduling_request",
  "escalation",
];
const VALID_DECISIONS: Decision[] = [
  "approve",
  "reject",
  "negotiate",
  "schedule",
  "escalate_to_owner",
];

const SYSTEM = `You are an AI operations manager for a one-person business. You make practical business decisions based on explicit owner policies. Never expose chain-of-thought. Reasoning_summary should be one short business sentence. Return only valid JSON.`;

export async function enhanceWithLLM(
  input: LlmInput,
): Promise<LlmEnhancement | null> {
  const provider = detectLlmProvider();
  if (!provider) return null;

  try {
    if (provider === "gemini") {
      const resp = await callGemini({
        managerName: input.manager_name ?? "Opelo",
        classification: input.classification,
        decision: input.decision,
        policy_applied: input.policy_applied,
        detected_amount: input.detected_amount,
        customer_name: input.customer_name,
        customer_email: input.customer_email,
        is_vip: input.is_vip,
        message_body: input.message_body,
        next_slot_label: input.next_slot_label,
        business_name: demoBusiness.name,
        owner_name: demoBusiness.ownerName,
      });
      if (!resp) return null;
      return {
        reasoning_summary: resp.reasoning_summary,
        customer_response: resp.customer_response,
        owner_summary: resp.owner_summary,
        refined_classification: VALID_CLASSIFICATIONS.includes(
          resp.classification as Classification,
        )
          ? (resp.classification as Classification)
          : undefined,
        refined_decision: VALID_DECISIONS.includes(resp.decision as Decision)
          ? (resp.decision as Decision)
          : undefined,
        refined_policy_applied: resp.policy_applied || undefined,
      };
    }
    if (provider === "openai") {
      const text = await callOpenAI(buildPrompt(input));
      return parseEnhancement(text);
    }
    if (provider === "anthropic") {
      const text = await callAnthropic(buildPrompt(input));
      return parseEnhancement(text);
    }
    return null;
  } catch {
    return null;
  }
}

async function callOpenAI(userPrompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!resp.ok) return "";
  const data = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(userPrompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return "";
  const client = new Anthropic({ apiKey: key });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const resp = await client.messages.create({
    model,
    max_tokens: 600,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  return resp.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
}

function buildPrompt(input: LlmInput): string {
  return `Decision context:
- classification: ${input.classification}
- decision: ${input.decision}
- policy_applied: ${input.policy_applied}
- detected_amount: ${input.detected_amount ?? "n/a"}
- customer: ${input.customer_name} <${input.customer_email}>${input.is_vip ? " [VIP]" : ""}
- proposed_slot: ${input.next_slot_label ?? "n/a"}

Inbound message:
"""
${input.message_body}
"""

Return ONLY a JSON object with keys: reasoning_summary, customer_response, owner_summary. No prose outside JSON. reasoning_summary is one short business sentence, not chain-of-thought.`;
}

function parseEnhancement(text: string): LlmEnhancement | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return {
      reasoning_summary: String(parsed.reasoning_summary ?? "").slice(0, 400),
      customer_response: String(parsed.customer_response ?? "").slice(0, 1500),
      owner_summary: String(parsed.owner_summary ?? "").slice(0, 280),
    };
  } catch {
    return null;
  }
}
