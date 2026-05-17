"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Customer, InboundMessage, MockExternalAction, ProcessResult } from "@/lib/types";
import { ChannelBadge, ClassificationBadge, DecisionBadge, StatusPill } from "@/components/Badges";

type ProcessState = {
  result: ProcessResult | null;
  loading: boolean;
  step: "idle" | "classifying" | "policy" | "deciding" | "acting" | "notifying" | "done";
};

const STEP_ORDER: ProcessState["step"][] = [
  "classifying", "policy", "deciding", "acting", "notifying", "done",
];
const STEP_LABEL: Record<ProcessState["step"], string> = {
  idle:        "Idle",
  classifying: "Reading message",
  policy:      "Checking your rules",
  deciding:    "Choosing next step",
  acting:      "Taking care of it",
  notifying:   "Keeping you posted",
  done:        "Done",
};

export function InboxClient() {
  const [messages, setMessages]     = useState<InboundMessage[]>([]);
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resultsById, setResultsById] = useState<Record<string, ProcessResult>>({});
  const [stateById, setStateById]   = useState<Record<string, ProcessState>>({});
  const [seeding, setSeeding]       = useState(false);

  const refresh = async () => {
    const r    = await fetch("/api/messages", { cache: "no-store" });
    const data = await r.json();
    setMessages(data.messages);
    setCustomers(data.customers);
    if (!selectedId && data.messages.length) setSelectedId(data.messages[0].id);
  };

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected         = useMemo(() => messages.find((m) => m.id === selectedId) ?? null, [messages, selectedId]);
  const selectedCustomer = useMemo(() => selected ? customers.find((c) => c.id === selected.customer_id) : null, [selected, customers]);
  const selectedResult   = selected ? resultsById[selected.id] : undefined;
  const selectedState    = selected ? stateById[selected.id] ?? { result: null, loading: false, step: "idle" } : null;

  const runAI = async (messageId: string) => {
    setStateById((s) => ({ ...s, [messageId]: { result: null, loading: true, step: "classifying" } }));
    const fakeSteps: ProcessState["step"][] = ["classifying","policy","deciding","acting","notifying"];
    let idx = 0;
    const interval = setInterval(() => {
      idx = Math.min(idx + 1, fakeSteps.length - 1);
      setStateById((s) => ({ ...s, [messageId]: { ...(s[messageId] ?? { result: null, loading: true, step: "classifying" }), step: fakeSteps[idx] } }));
    }, 480);
    try {
      const r    = await fetch("/api/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message_id: messageId, use_llm: true }) });
      const data = await r.json();
      clearInterval(interval);
      if (!r.ok) {
        setStateById((s) => ({ ...s, [messageId]: { result: null, loading: false, step: "idle" } }));
        alert(data.error ?? "Failed to process");
        return;
      }
      const result: ProcessResult = data.result;
      setResultsById((s) => ({ ...s, [messageId]: result }));
      setStateById((s) => ({ ...s, [messageId]: { result, loading: false, step: "done" } }));
      await refresh();
    } catch {
      clearInterval(interval);
      setStateById((s) => ({ ...s, [messageId]: { result: null, loading: false, step: "idle" } }));
    }
  };

  const reseed = async () => {
    setSeeding(true);
    try {
      await fetch("/api/seed", { method: "POST" });
      setResultsById({});
      setStateById({});
      await refresh();
    } finally { setSeeding(false); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 md:py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label">Inbox</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
            Inbound requests
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Pick a message and let Opelo help with the reply, refund, booking, or next step.
          </p>
        </div>
        <button onClick={reseed} disabled={seeding} className="btn shrink-0">
          {seeding ? "Loading…" : "Load demo"}
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">

        {/* Message list */}
        <ul className="min-w-0 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {messages.map((m) => {
            const c          = customers.find((x) => x.id === m.customer_id);
            const isSelected = m.id === selectedId;
            return (
              <li key={m.id}>
                <button
                  onClick={() => setSelectedId(m.id)}
                  className={clsx(
                    "w-full px-4 py-4 text-left transition",
                    isSelected ? "bg-stone-50" : "hover:bg-stone-50/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-stone-900">
                      {c?.name ?? m.customer_id}
                    </span>
                    <StatusPill status={m.status} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ChannelBadge value={m.channel} />
                    <span className="truncate text-xs text-stone-400">{m.subject}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-stone-500">
                    {m.body}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Detail panel */}
        <section className="min-w-0 space-y-4">
          {selected && selectedCustomer ? (
            <>
              {/* Message card */}
              <div className="card min-w-0 overflow-hidden p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-stone-900">{selectedCustomer.name}</span>
                      <span className="text-stone-300">·</span>
                      <span className="min-w-0 break-all text-stone-500">{selectedCustomer.email}</span>
                      {selectedCustomer.vip && (
                        <span className="pill border-lime-200 bg-lime-50 text-lime-700">VIP</span>
                      )}
                      <ChannelBadge value={selected.channel} />
                    </div>
                    <h2 className="mt-1.5 break-words text-lg font-semibold text-stone-900">{selected.subject}</h2>
                  </div>
                  <button
                    onClick={() => runAI(selected.id)}
                    disabled={selectedState?.loading}
                    className="btn-primary shine w-full shrink-0 sm:w-auto"
                  >
                    {selectedState?.loading ? "Helping…" : "Let Opelo help"}
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 3l14 9-14 9V3z" />
                    </svg>
                  </button>
                </div>
                <pre className="mt-4 max-w-full whitespace-pre-wrap break-words rounded-xl border border-stone-100 bg-stone-50 p-4 font-sans text-sm leading-relaxed text-stone-700">
                  {selected.body}
                </pre>
              </div>

              {selectedState && selectedState.step !== "idle" && (
                <StepStrip step={selectedState.step} loading={selectedState.loading} />
              )}
              {selectedResult && <ResultPanel result={selectedResult} />}
            </>
          ) : (
            <div className="rounded-2xl border border-stone-100 bg-stone-50 p-6 text-sm text-stone-400">
              Select a message to begin.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StepStrip({ step, loading }: { step: ProcessState["step"]; loading: boolean }) {
  const activeIdx = STEP_ORDER.indexOf(step);
  return (
    <div className="card p-5">
      <div className="label mb-3 flex items-center gap-2">
        <span className={clsx("h-1.5 w-1.5 rounded-full", loading ? "bg-lime-500" : "bg-emerald-500")} />
        {loading ? "Opelo is working…" : "Opelo finished"}
      </div>
      <ol className="flex flex-wrap gap-2">
        {STEP_ORDER.slice(0, 5).map((s, i) => {
          const done    = i < activeIdx || step === "done";
          const current = i === activeIdx && step !== "done";
          return (
            <li
              key={s}
              className={clsx(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                done    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : current ? "border-lime-300 bg-lime-50 text-lime-700"
                : "border-stone-200 bg-stone-50 text-stone-400",
              )}
            >
              <span className="font-mono text-[10px] opacity-60">{String(i + 1).padStart(2, "0")}</span>
              {STEP_LABEL[s]}
              {current && <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-lime-500" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ResultPanel({ result }: { result: ProcessResult }) {
  return (
    <div className="min-w-0 space-y-4">
      {/* Classification & decision */}
      <div className="card min-w-0 overflow-hidden p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <ClassificationBadge value={result.classification} />
          <DecisionBadge value={result.decision} />
          {result.llm_used ? (
            <span className="pill border-lime-200 bg-lime-50 text-lime-700">Personalized</span>
          ) : (
            <span className="pill border-stone-200 bg-stone-100 text-stone-600">Rule matched</span>
          )}
          {typeof result.revenue_delta === "number" && result.revenue_delta !== 0 && (
            <span className={clsx("pill", result.revenue_delta > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
              {result.revenue_delta > 0 ? "+" : "−"}${Math.abs(result.revenue_delta).toFixed(2)}
            </span>
          )}
        </div>

        <div className="mt-5 grid min-w-0 gap-6 md:grid-cols-2">
          <div className="min-w-0">
            <div className="label">Why this makes sense</div>
            <p className="mt-1.5 break-words text-sm leading-relaxed text-stone-700">{result.reasoning_summary}</p>
            <div className="label mt-4">Rule Opelo used</div>
            <p className="mt-1.5 break-words text-sm leading-relaxed text-stone-700">{result.policy_applied}</p>
          </div>
          <div className="min-w-0">
            <div className="label">Your quick summary</div>
            <p className="mt-1.5 break-words text-sm leading-relaxed text-stone-700">{result.owner_summary}</p>
          </div>
        </div>
      </div>

      {/* Draft reply */}
      <div className="card min-w-0 overflow-hidden p-4 sm:p-6">
        <div className="label mb-3">Reply Opelo prepared</div>
        <pre className="max-w-full whitespace-pre-wrap break-words rounded-xl border border-stone-100 bg-stone-50 p-4 font-sans text-sm leading-relaxed text-stone-700">
          {result.customer_response}
        </pre>
      </div>

      {/* Actions */}
      <ActionsList actions={result.mock_external_actions} />
    </div>
  );
}

function ActionsList({ actions }: { actions: MockExternalAction[] }) {
  return (
    <div className="card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="label mb-3">What Opelo did</div>
      <ul className="space-y-2">
        {actions.map((a, i) => (
          <li key={a.ref + i} className="flex min-w-0 items-start gap-3 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
            <span className={clsx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold", a.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
              {a.ok ? "✓" : "✕"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="break-words text-xs font-medium text-stone-800">{friendlyActionName(a.name)}</span>
              </div>
              {a.detail && <div className="mt-0.5 max-w-full break-words text-xs leading-5 text-stone-500">{friendlyActionDetail(a.detail)}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function friendlyActionName(name: string): string {
  if (name.includes("refund")) return "Refund handled";
  if (name.includes("payment")) return "Payment link prepared";
  if (name.includes("calendar") || name.includes("booking")) return "Meeting prepared";
  if (name.includes("agentmail") || name.includes("reply")) return "Customer reply sent";
  if (name.includes("agentphone") || name.includes("sms")) return "You were notified";
  if (name.includes("supermemory") || name.includes("memory")) return "Remembered for next time";
  return "Task completed";
}

function friendlyActionDetail(detail: string): string {
  if (/Refunded/i.test(detail)) return detail.replace(/ via .+$/i, ".");
  if (/Payment link/i.test(detail)) return "A payment link is ready for the customer.";
  if (/Replied to/i.test(detail)) return "The customer received a reply.";
  if (/SMS to owner/i.test(detail)) return "You received a quick update.";
  if (/Saved decision/i.test(detail)) return "Opelo will remember this for next time.";
  return detail.replace(/\b[a-z]+_[a-z0-9_.-]+\b/gi, "").trim();
}
