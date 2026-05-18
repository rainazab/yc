"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SeeDemoButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setLoading(true);
    try {
      await fetch("/api/seed", { method: "POST" });
    } finally {
      router.push("/dashboard");
    }
  };

  return (
    <button onClick={handleClick} disabled={loading}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:opacity-50"
    >
      {loading ? "Loading demo…" : "See demo"}
    </button>
  );
}
