import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/onboard
 * Accepts a plain-text business description from the landing page CTA.
 * Parses key thresholds out of the text and updates the active policy set so
 * the AI manager immediately reflects the user's intent.
 */
export async function POST(req: NextRequest) {
  try {
    const { description, fresh, business_name } = await req.json().catch(() => ({
      description: "",
      fresh: false,
      business_name: "",
    }));
    if (!description || typeof description !== "string") {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }

    if (fresh === true) {
      await store.resetBlank();
    }
    if (typeof business_name === "string" && business_name.trim()) {
      await store.setBusinessName(business_name);
    }
    await store.setBusinessDescription(description);

    const text = description.toLowerCase();

    // Simple heuristic extraction — works without an LLM key so the demo
    // always responds, and Gemini/Claude/OpenAI will refine it at process time.
    const policies = await store.getPolicies();

    // Refund threshold
    const refundMatch = text.match(/refund[^$]*\$\s*(\d+)/);
    if (refundMatch) {
      const amt = Number(refundMatch[1]);
      if (amt > 0 && amt < 5000) policies.refund_auto_approve_under = amt;
    }

    // Lead auto-book threshold
    const leadMatch = text.match(/lead[^$]*\$\s*(\d+(?:k|,\d{3})?)/);
    if (leadMatch) {
      const raw = leadMatch[1].replace(/k$/, "000").replace(/,/g, "");
      const amt = Number(raw);
      if (amt > 0) policies.auto_book_lead_above = amt;
    }

    // Min project price
    const projectMatch = text.match(/project[^$]*\$\s*(\d+(?:k|,\d{3})?)/);
    if (projectMatch) {
      const raw = projectMatch[1].replace(/k$/, "000").replace(/,/g, "");
      const amt = Number(raw);
      if (amt > 0) policies.min_project_price = amt;
    }

    await store.setPolicies(policies);

    return NextResponse.json({ ok: true, policies });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
