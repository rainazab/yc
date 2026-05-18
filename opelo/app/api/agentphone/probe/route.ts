import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hammer common AgentPhone endpoint shapes so the user can find the one their
 * tenant accepts without reading docs. Reports per-path status code + first
 * 200 chars of body. Also looks for an OpenAPI schema, which is the fastest
 * way to see the real route list.
 */
export async function GET() {
  const base = (
    process.env.AGENTPHONE_BASE_URL?.replace(/\/$/, "") ||
    "https://api.agentphone.ai/v1"
  );
  const key = process.env.AGENTPHONE_API_KEY;
  const from = process.env.AGENTPHONE_NUMBER ?? "+15555550100";
  const owner = process.env.OWNER_PHONE_NUMBER ?? "+15555550123";

  if (!key) {
    return NextResponse.json(
      { ok: false, error: "AGENTPHONE_API_KEY missing" },
      { status: 400 },
    );
  }

  const auth = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const probes: { method: "GET" | "POST"; path: string; body?: object }[] = [
    { method: "GET", path: "/openapi.json" },
    { method: "GET", path: "/docs" },
    { method: "GET", path: "/" },
    { method: "GET", path: "/health" },
    { method: "GET", path: "/inboxes" },
    { method: "GET", path: "/numbers" },
    { method: "GET", path: "/agents" },
    { method: "GET", path: "/messages" },
    { method: "GET", path: "/sms" },
    { method: "POST", path: "/sms", body: { from, to: owner, body: "probe" } },
    { method: "POST", path: "/sms/send", body: { from, to: owner, body: "probe" } },
    { method: "POST", path: "/messages", body: { from, to: owner, body: "probe" } },
    { method: "POST", path: "/messages/send", body: { from, to: owner, body: "probe" } },
    { method: "POST", path: "/messages/send", body: { from, to: owner, text: "probe" } },
    { method: "POST", path: "/send", body: { from, to: owner, body: "probe" } },
    { method: "POST", path: "/send-sms", body: { from, to: owner, body: "probe" } },
  ];

  const results = await Promise.all(
    probes.map(async (p) => {
      const url = `${base}${p.path}`;
      try {
        const init: RequestInit = {
          method: p.method,
          headers: auth,
        };
        if (p.body) init.body = JSON.stringify(p.body);
        const resp = await fetch(url, init);
        const text = await resp.text().catch(() => "");
        return {
          method: p.method,
          path: p.path,
          url,
          status: resp.status,
          ok: resp.ok,
          body_preview: text.slice(0, 240),
        };
      } catch (err) {
        return {
          method: p.method,
          path: p.path,
          url,
          status: 0,
          ok: false,
          error: err instanceof Error ? err.message : "network_error",
        };
      }
    }),
  );

  // Also try hitting the host root in case docs live one level up.
  const host = base.replace(/\/v\d+$/, "");
  let host_root: unknown = null;
  if (host !== base) {
    try {
      const r = await fetch(`${host}/openapi.json`, { headers: auth });
      host_root = {
        url: `${host}/openapi.json`,
        status: r.status,
        body_preview: (await r.text().catch(() => "")).slice(0, 240),
      };
    } catch (err) {
      host_root = { error: err instanceof Error ? err.message : "fail" };
    }
  }

  const interesting = results.filter((r) => r.status !== 404 && r.status !== 405);

  return NextResponse.json({
    ok: true,
    base,
    summary: {
      total: results.length,
      not_404: interesting.length,
      best_guess:
        interesting.find((r) => r.method === "POST" && r.status < 300)?.path ??
        interesting.find((r) => r.method === "POST")?.path ??
        null,
    },
    interesting,
    all: results,
    host_root,
  });
}
