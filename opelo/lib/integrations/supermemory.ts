/**
 * Supermemory — persistent customer memory across conversations.
 *
 * SAVE  → after every decision, write a plain-English summary
 * SEARCH → before processing, retrieve past interactions with this customer
 *
 * API returns 308 redirects; all fetch calls use redirect:"follow".
 */
import { MockExternalAction } from "../types";
import { isDemo, nanoid } from "./util";

const BASE = "https://api.supermemory.ai";
const KEY  = () => process.env.SUPERMEMORY_API_KEY ?? "";

export interface SupermemoryDecisionInput {
  customerId:     string;
  customerName:   string;
  classification: string;
  decision:       string;
  policyApplied:  string;
  ownerSummary:   string;
  amountCents?:   number;
}

export interface SupermemoryResponse<T> {
  ok: boolean;
  provider: "supermemory";
  mode: "mock" | "live";
  data: T;
  log: string;
}

function inMockMode(): boolean {
  return isDemo(KEY());
}

function hdrs(): Record<string, string> {
  return { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" };
}

// ── Save a decision as a retrievable memory ──────────────────────────────────

export async function saveDecision(
  input: SupermemoryDecisionInput,
): Promise<SupermemoryResponse<{ id: string }>> {
  const fallback = { id: nanoid("mem") };

  if (inMockMode()) {
    return { ok: true, provider: "supermemory", mode: "mock", data: fallback, log: "supermemory.mock.decision.saved" };
  }

  const amtStr  = input.amountCents ? ` ($${(input.amountCents / 100).toFixed(2)})` : "";
  const content = [
    `Customer: ${input.customerName} (id: ${input.customerId})`,
    `Request type: ${input.classification.replace(/_/g, " ")}${amtStr}`,
    `Decision: ${input.decision.replace(/_/g, " ")}`,
    `Policy applied: ${input.policyApplied}`,
    `Summary: ${input.ownerSummary}`,
  ].join("\n");

  try {
    const resp = await fetch(`${BASE}/v3/memories`, {
      method: "POST", redirect: "follow", headers: hdrs(),
      body: JSON.stringify({ content, containerTags: ["opelo", input.customerId] }),
    });
    if (resp.ok) {
      const d = await resp.json() as { id?: string };
      return { ok: true, provider: "supermemory", mode: "live", data: { id: d.id ?? fallback.id }, log: "supermemory.decision.saved" };
    }
  } catch { /* fall through */ }

  return { ok: false, provider: "supermemory", mode: "live", data: fallback, log: "supermemory.decision.save_failed" };
}

// ── Search for past context on a customer ────────────────────────────────────

export async function searchMemory(
  query: string,
): Promise<SupermemoryResponse<{ matches: string[]; query: string }>> {
  const fallback = { matches: [] as string[], query };

  if (inMockMode()) {
    return { ok: true, provider: "supermemory", mode: "mock", data: fallback, log: "supermemory.mock.memory.searched" };
  }

  try {
    const resp = await fetch(`${BASE}/v3/search`, {
      method: "POST", redirect: "follow", headers: hdrs(),
      body: JSON.stringify({ q: query, limit: 5 }),
    });
    if (resp.ok) {
      const d = await resp.json() as { results?: { content?: string; document?: { content?: string } }[] };
      const matches = (d.results ?? [])
        .map(r => r.content ?? r.document?.content ?? "")
        .filter(Boolean);
      return { ok: true, provider: "supermemory", mode: "live", data: { matches, query }, log: "supermemory.memory.searched" };
    }
  } catch { /* fall through */ }

  return { ok: false, provider: "supermemory", mode: "live", data: fallback, log: "supermemory.memory.search_failed" };
}

export const supermemory = { saveDecision, searchMemory, inMockMode };

export function toMockExternalAction(
  resp: SupermemoryResponse<unknown>,
  detail: string,
): MockExternalAction {
  return { name: resp.log, ok: resp.ok, ref: nanoid("sm"), detail };
}
