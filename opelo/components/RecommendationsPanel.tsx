"use client";

import { useState } from "react";
import Link from "next/link";
import { AppIcon, AppIconName } from "@/components/AppIcon";

export interface BusinessRecommendation {
  id: string;
  icon: AppIconName;
  title: string;
  summary: string;
  detail: string;
  steps: string[];
  actionLabel: string;
  href: string;
}

export function RecommendationsPanel({
  recommendations,
}: {
  recommendations: BusinessRecommendation[];
}) {
  const [selected, setSelected] = useState<BusinessRecommendation | null>(null);

  return (
    <aside className="space-y-3">
      <div>
        <h2 className="font-serif text-2xl text-stone-900">Recommendations</h2>
        <p className="mt-1 text-sm leading-5 text-stone-500">A few practical next moves Opelo sees for the business.</p>
      </div>

      <div className="space-y-3">
        {recommendations.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(item)}
            className="group w-full rounded-2xl border border-stone-100 bg-white p-4 text-left shadow-sm shadow-stone-900/5 transition hover:-translate-y-0.5 hover:border-lime-200 hover:shadow-lg hover:shadow-lime-900/10"
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime-50 text-lime-700">
                <AppIcon name={item.icon} className="h-4 w-4" />
              </span>
              <span className="rounded-full border border-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-400 transition group-hover:border-lime-200 group-hover:text-lime-700">
                View
              </span>
            </div>
            <p className="font-semibold leading-5 text-stone-900">{item.title}</p>
            <p className="mt-1 text-sm leading-5 text-stone-500">{item.summary}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#030303]/35 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[calc(100vh-48px)] w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl shadow-stone-900/20 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime-100 text-lime-700">
                <AppIcon name={selected.icon} />
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
                aria-label="Close recommendation"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <h3 className="font-serif text-2xl leading-tight text-stone-900 sm:text-3xl">{selected.title}</h3>
            <p className="mt-3 text-sm leading-6 text-stone-600">{selected.detail}</p>

            <div className="mt-5 rounded-2xl bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">What to do</p>
              <ol className="mt-3 space-y-2">
                {selected.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-5 text-stone-600">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-stone-500">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="btn"
              >
                Not now
              </button>
              <Link href={selected.href} className="btn-primary" onClick={() => setSelected(null)}>
                {selected.actionLabel}
              </Link>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
