"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CTAInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) { router.push("/get-started"); return; }
    setLoading(true);
    try {
      await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: value.trim(), fresh: true }),
      });
    } finally {
      setLoading(false);
      router.push("/dashboard");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="gradient-border-wrap relative mx-auto mt-8 w-full max-w-2xl">
      <div className="bg-white py-3.5 pl-4 pr-14 sm:pl-6 sm:pr-16" style={{ borderRadius: "50px" }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. I run a coffee shop. Approve refunds under $50, book meetings with leads above $1k…"
          className="w-full bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:opacity-80 disabled:opacity-50"
        style={{ background: "#030303" }}
      >
        {loading ? <Spinner /> : <SendIcon />}
      </button>
    </form>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 19H8V21H2V13H4V19ZM12 19H8V17H12V19ZM16 17H12V15H16V17ZM20 15H16V13H20V15ZM10 13H4V11H10V13ZM22 13H20V11H22V13ZM8 5H4V11H2V3H8V5ZM20 11H16V9H20V11ZM16 9H12V7H16V9ZM12 7H8V5H12V7Z" fill="#86FF44" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="#86FF44" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  );
}
