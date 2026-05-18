import { MockExternalAction } from "../types";
import { isDemo, nanoid } from "./util";

export interface SupermemoryDecisionInput {
  customerId: string;
  classification: string;
  decision: string;
  policyApplied: string;
  ownerSummary: string;
}

export interface SupermemoryResponse<T> {
  ok: boolean;
  provider: "supermemory";
  mode: "mock" | "live";
  data: T;
  log: string;
}

function inMockMode(): boolean {
  return isDemo(process.env.SUPERMEMORY_API_KEY);
}

function mockResponse<T>(log: string, data: T): SupermemoryResponse<T> {
  return { ok: true, provider: "supermemory", mode: "mock", data, log };
}

function liveResponse<T>(log: string, data: T): SupermemoryResponse<T> {
  return { ok: true, provider: "supermemory", mode: "live", data, log };
}

export async function saveDecision(
  input: SupermemoryDecisionInput,
): Promise<SupermemoryResponse<{ id: string }>> {
  const id = nanoid("mem");
  if (inMockMode()) {
    return mockResponse("supermemory.mock.decision.saved", { id });
  }
  return liveResponse("supermemory.decision.saved", { id });
}

export async function searchMemory(
  query: string,
): Promise<SupermemoryResponse<{ matches: string[]; query: string }>> {
  if (inMockMode()) {
    return mockResponse("supermemory.mock.memory.searched", {
      matches: [],
      query,
    });
  }
  return liveResponse("supermemory.memory.searched", {
    matches: [],
    query,
  });
}

export const supermemory = {
  saveDecision,
  searchMemory,
  inMockMode,
};

export function toMockExternalAction(
  resp: SupermemoryResponse<unknown>,
  detail: string,
): MockExternalAction {
  return {
    name: resp.log,
    ok: resp.ok,
    ref: nanoid("sm"),
    detail,
  };
}
