"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

interface IntegrationStatus {
  key: string; label: string; mode: "live" | "mock";
  expects: string[]; present: string[]; missing: string[]; note?: string;
}
interface LlmStatus {
  key: string; label: string; mode: "live" | "mock";
  provider: "openai" | "anthropic" | null; model: string | null;
  expects: string[]; present: string[]; note: string;
}
interface StatusResponse {
  ok: true; generated_at: string; llm: LlmStatus;
  integrations: IntegrationStatus[]; summary: { live_count: number; total: number };
}

export function IntegrationsStatus() {
  const [data, setData]         = useState<StatusResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try { const r = await fetch("/api/status", { cache: "no-store" }); setData(await r.json()); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { refresh(); }, []);

  if (!data) return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-sm text-stone-400">
      Checking integrations…
    </div>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <div>
          <div className="label">Integrations</div>
          <p className="mt-0.5 text-xs text-stone-500">
            {data.summary.live_count} of {data.summary.total} live ·{" "}
            determined by env vars present at request time
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="btn text-xs">
          {refreshing ? "Checking…" : "Re-check"}
        </button>
      </div>
      <ul className="divide-y divide-stone-100">
        <Row item={llmAsItem(data.llm)} />
        {data.integrations.map((it) => <Row key={it.key} item={it} />)}
      </ul>
    </div>
  );
}

interface RowItem {
  key: string; label: string; mode: "live" | "mock";
  expects: string[]; present: string[]; missing: string[]; note?: string; badge?: string;
}

function llmAsItem(llm: LlmStatus): RowItem {
  return {
    key: llm.key, label: llm.label, mode: llm.mode,
    expects: llm.expects, present: llm.present,
    missing: llm.expects.filter((e) => !llm.present.includes(e)),
    note: llm.note,
    badge: llm.provider ? `${llm.provider}${llm.model ? ` · ${llm.model}` : ""}` : undefined,
  };
}

function Row({ item }: { item: RowItem }) {
  const live = item.mode === "live";
  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <span className={clsx("mt-1 h-2 w-2 shrink-0 rounded-full", live ? "bg-emerald-500" : "bg-stone-300")} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-stone-900">{item.label}</span>
          <span className={clsx("pill", live ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-stone-200 bg-stone-100 text-stone-500")}>
            {live ? "Live" : "Mock"}
          </span>
          {item.badge && (
            <span className="pill border-lime-200 bg-lime-50 text-lime-700">{item.badge}</span>
          )}
        </div>
        {item.note && <p className="mt-1 text-xs text-stone-500">{item.note}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.expects.map((e) => {
            const has = item.present.includes(e);
            return (
              <span key={e} title={has ? "Present" : "Missing"}
                className={clsx("rounded-md border px-1.5 py-0.5 font-mono text-[10px]",
                  has ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-stone-200 bg-stone-100 text-stone-400")}
              >
                {has ? "✓" : "○"} {e}
              </span>
            );
          })}
        </div>
      </div>
    </li>
  );
}
