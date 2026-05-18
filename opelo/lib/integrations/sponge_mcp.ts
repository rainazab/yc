/**
 * Sponge MCP client — wraps the JSON-RPC/MCP protocol that Sponge exposes.
 *
 * Each exported function opens its own session (initialize → tool call).
 * Sessions are short-lived so we don't maintain a global cache.
 *
 * Live demo amounts are capped at $0.50 when NEXT_PUBLIC_DEMO_MODE=true
 * to protect the wallet balance while proving the infrastructure works.
 */

const MCP_URL = "https://api.wallet.paysponge.com/mcp";
const DEMO_CAP_USD = 0.5; // $0.50 per payment link in demo mode

export interface SpongeMcpPaymentLink {
  id: string;
  url: string;
  amount_usd: number;
  capped: boolean;
}

export interface SpongeMcpBalance {
  chain: string;
  usdc_balance: number;
}

// ─── Low-level MCP helpers ───────────────────────────────────────────────────

async function initSession(apiKey: string): Promise<string> {
  const resp = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "opelo", version: "1.0" } },
      id: 1,
    }),
  });

  const sid = resp.headers.get("mcp-session-id") ?? resp.headers.get("Mcp-Session-Id") ?? "";
  if (!sid) throw new Error("Sponge MCP: no session ID from initialize");
  return sid;
}

async function callTool(
  apiKey: string,
  sid: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const resp = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": sid,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name, arguments: args },
      id: 2,
    }),
  });

  if (!resp.ok) throw new Error(`Sponge MCP HTTP ${resp.status}`);

  const json = await resp.json() as {
    result?: { content?: { type: string; text?: string }[]; isError?: boolean };
    error?: { message: string };
  };

  if (json.error) throw new Error(`Sponge RPC error: ${json.error.message}`);

  const text = json.result?.content?.find(c => c.type === "text")?.text ?? "";
  if (json.result?.isError) throw new Error(`Sponge tool error: ${text.slice(0, 300)}`);
  if (!text) return null;

  try { return JSON.parse(text); } catch { return text; }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a Sponge payment link. In demo mode, amount is capped at $0.50
 * to protect the wallet balance while still proving live payment works.
 */
export async function createSpongeMcpPaymentLink(input: {
  description: string;
  amountUsd: number;
}): Promise<SpongeMcpPaymentLink> {
  const apiKey = process.env.SPONGE_API_KEY;
  if (!apiKey) throw new Error("SPONGE_API_KEY not set");

  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const capped  = isDemo && input.amountUsd > DEMO_CAP_USD;
  const amount  = capped ? DEMO_CAP_USD : input.amountUsd;
  const desc    = capped
    ? `${input.description} [demo — capped to $${amount.toFixed(2)}]`
    : input.description;

  const sid = await initSession(apiKey);

  // 1. Create a task (required before creating a payment link)
  const task = await callTool(apiKey, sid, "create_task", {
    title: desc.slice(0, 100),
    default_amount: amount,
  }) as { id?: string } | null;
  if (!task?.id) throw new Error("Sponge create_task returned no id");

  // 2. Create the payment link
  const link = await callTool(apiKey, sid, "create_payment_link", {
    task_id: task.id,
    amount,
    description: desc,
    max_uses: 1,
  }) as { id?: string; url?: string } | null;
  if (!link?.url) throw new Error("Sponge create_payment_link returned no url");

  return { id: link.id ?? task.id, url: link.url, amount_usd: amount, capped };
}

/**
 * Get USDC balance across all Sponge wallet chains.
 */
export async function getSpongeMcpBalance(): Promise<{ total_usdc: number; by_chain: SpongeMcpBalance[] }> {
  const apiKey = process.env.SPONGE_API_KEY;
  if (!apiKey) return { total_usdc: 0, by_chain: [] };
  try {
    const sid    = await initSession(apiKey);
    const result = await callTool(apiKey, sid, "get_balance", { chain: "all" }) as Record<string, unknown> | null;
    if (!result) return { total_usdc: 0, by_chain: [] };

    const by_chain: SpongeMcpBalance[] = [];
    let total = 0;
    for (const [chain, addrs] of Object.entries(result)) {
      if (typeof addrs !== "object" || !addrs) continue;
      for (const balances of Object.values(addrs as Record<string, unknown>)) {
        if (!Array.isArray(balances)) continue;
        for (const b of balances as { token: string; amount: number | string }[]) {
          if (/usdc/i.test(b.token ?? "")) {
            // Sponge returns amounts in micro-units (6 decimals)
            const usd = Number(b.amount) / 1_000_000;
            const existing = by_chain.find(x => x.chain === chain);
            if (existing) existing.usdc_balance += usd;
            else by_chain.push({ chain, usdc_balance: usd });
            total += usd;
          }
        }
      }
    }
    return { total_usdc: total, by_chain };
  } catch { return { total_usdc: 0, by_chain: [] }; }
}

/**
 * Check if a specific payment link has been paid by polling payment events.
 */
export async function checkSpongeLinkPaid(linkId: string): Promise<boolean> {
  const apiKey = process.env.SPONGE_API_KEY;
  if (!apiKey) return false;
  try {
    const sid    = await initSession(apiKey);
    const result = await callTool(apiKey, sid, "list_payment_events", { limit: 50 }) as unknown;
    const events: { payment_link_id?: string; type?: string }[] = Array.isArray(result)
      ? result
      : (result as { events?: unknown[] })?.events ?? [];
    return events.some(e => e.payment_link_id === linkId && /paid|completed|success/i.test(e.type ?? ""));
  } catch { return false; }
}
