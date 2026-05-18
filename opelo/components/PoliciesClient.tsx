"use client";

import { useEffect, useState } from "react";
import { Policies } from "@/lib/types";
import { AppIcon, AppIconName } from "@/components/AppIcon";

export function PoliciesClient() {
  const [policies, setPolicies] = useState<Policies | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    fetch("/api/policies", { cache: "no-store" }).then((r) => r.json()).then(setPolicies);
  }, []);

  if (!policies) {
    return <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-stone-400">Loading policies…</div>;
  }

  const update = <K extends keyof Policies>(key: K, value: Policies[K]) => {
    setPolicies({ ...policies, [key]: value });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch("/api/policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policies) });
      const data = await r.json();
      setPolicies(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <div className="label">My Rules</div>
          <h1 className="mt-1 font-serif text-3xl tracking-tight text-stone-900">
            How Opelo should help
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Set the simple boundaries Opelo should follow before it replies, books, refunds, or asks you to step in.
          </p>
        </div>
        <div className="hidden sm:block">
          <SaveButton saving={saving} saved={saved} onClick={save} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-stone-100 bg-white p-4 sm:p-6">
          <SectionTitle icon="money" label="Money & bookings" />
          <div className="mt-4 divide-y divide-stone-100">
            <RuleNumberRow label="Refunds Opelo can approve" helper="Anything below this amount can be handled quickly." value={policies.refund_auto_approve_under} onChange={(v) => update("refund_auto_approve_under", v)} />
            <RuleNumberRow label="Strong lead budget" helper="If a lead says they can spend this much, Opelo can help book them." value={policies.auto_book_lead_above} onChange={(v) => update("auto_book_lead_above", v)} />
            <RuleNumberRow label="Lowest sponsorship price" helper="Opelo will not agree to offers below this." value={policies.min_sponsorship_price} onChange={(v) => update("min_sponsorship_price", v)} />
            <RuleNumberRow label="Lowest project price" helper="Protect your minimum for client work." value={policies.min_project_price} onChange={(v) => update("min_project_price", v)} />
          </div>
        </section>

        <section className="rounded-[28px] border border-stone-100 bg-stone-50 p-4 sm:p-6">
          <SectionTitle icon="bell" label="When to ask you" />
          <div className="mt-5 space-y-5">
            <CompactListField label="Important customers" values={policies.vip_customers} placeholder="founder@partnerco.com" onChange={(arr) => update("vip_customers", arr)} />
            <CompactListField label="Sensitive words" values={policies.escalation_keywords} placeholder="urgent" onChange={(arr) => update("escalation_keywords", arr)} />
          </div>
        </section>
      </div>

      <div className="rounded-[28px] border border-stone-100 bg-white p-4 sm:p-6">
        <SectionTitle icon="calendar" label="Your booking note" />
        <p className="mt-2 text-sm text-stone-500">The line Opelo can share when someone asks to meet.</p>
        <textarea className="field mt-4 min-h-[96px] rounded-2xl" value={policies.booking_availability} onChange={(e) => update("booking_availability", e.target.value)} />
      </div>

      <div className="sticky bottom-4 z-10 flex justify-stretch sm:justify-end">
        <SaveButton saving={saving} saved={saved} onClick={save} compact />
      </div>
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: AppIconName; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime-100 text-lime-700">
        <AppIcon name={icon} className="h-4 w-4" />
      </span>
      <h2 className="font-serif text-xl text-stone-900 sm:text-2xl">{label}</h2>
    </div>
  );
}

function RuleNumberRow({ label, helper, value, onChange }: { label: string; helper: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="grid gap-4 py-4 sm:grid-cols-[1fr_160px] sm:items-center">
      <span>
        <span className="block text-sm font-semibold text-stone-900">{label}</span>
        <span className="mt-1 block text-sm leading-5 text-stone-500">{helper}</span>
      </span>
      <span className="flex items-center rounded-full border border-stone-200 bg-white px-4 py-2 focus-within:border-lime-400 focus-within:ring-2 focus-within:ring-lime-200">
        <span className="text-sm text-stone-400">$</span>
        <input
          type="number"
          className="w-full bg-transparent px-2 text-right text-sm font-semibold text-stone-900 outline-none"
          value={value}
          min={0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </span>
    </label>
  );
}

function CompactListField({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (next: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  const add = () => { const t = input.trim(); if (!t || values.includes(t)) return; onChange([...values, t]); setInput(""); };
  const remove = (i: number) => onChange(values.filter((_, j) => j !== i));

  return (
    <div>
      <label className="text-sm font-semibold text-stone-900">{label}</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input className="field rounded-full bg-white" placeholder={placeholder} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button onClick={add} className="btn shrink-0 rounded-full">Add</button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {values.length === 0 && <li className="text-xs text-stone-400">None yet.</li>}
        {values.map((v, i) => (
          <li key={v + i} className="pill border-stone-200 bg-stone-100 text-stone-700">
            <span>{v}</span>
            <button onClick={() => remove(i)} className="text-stone-400 transition hover:text-rose-500" aria-label={`remove ${v}`}>
              <AppIcon name="x" className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SaveButton({ saving, saved, onClick, compact = false }: { saving: boolean; saved: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <div className="flex w-full items-center justify-end gap-3 rounded-full border border-stone-100 bg-white/90 p-1.5 shadow-lg shadow-stone-900/5 backdrop-blur sm:w-auto">
      {saved && (
        <span className="inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-emerald-700">
          <AppIcon name="check" className="h-3.5 w-3.5" />
          Saved
        </span>
      )}
      <button onClick={onClick} disabled={saving} className="btn-primary">
        {saving ? "Saving..." : compact ? "Save rules" : "Save my rules"}
      </button>
    </div>
  );
}
