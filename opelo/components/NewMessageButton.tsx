"use client";

import { useState } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";

export function NewMessageButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="btn-primary inline-flex items-center gap-2"
        aria-expanded={open}
      >
        <AppIcon name="plus" className="h-4 w-4" />
        New message
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-stone-100 bg-white p-2 shadow-xl shadow-stone-900/10">
          <a
            href="mailto:?subject=New customer message&body=Paste the customer message here so Opelo can help."
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-stone-700 transition hover:bg-stone-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime-50 text-lime-700">
              <AppIcon name="mail" className="h-4 w-4" />
            </span>
            <span>
              <span className="block font-semibold text-stone-900">Email</span>
              <span className="block text-xs text-stone-400">Open your mail app</span>
            </span>
          </a>
          <a
            href="sms:&body=Paste%20the%20customer%20message%20here%20so%20Opelo%20can%20help."
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-stone-700 transition hover:bg-stone-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-50 text-sky-700">
              <AppIcon name="chat" className="h-4 w-4" />
            </span>
            <span>
              <span className="block font-semibold text-stone-900">Text</span>
              <span className="block text-xs text-stone-400">Open Messages</span>
            </span>
          </a>
          <Link
            href="/inbox"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-stone-700 transition hover:bg-stone-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-700">
              <AppIcon name="inbox" className="h-4 w-4" />
            </span>
            <span>
              <span className="block font-semibold text-stone-900">Use Opelo inbox</span>
              <span className="block text-xs text-stone-400">Try a message inside the app</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
