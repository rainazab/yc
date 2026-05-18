import Link from "next/link";

const tiers = [
  {
    name: "Starter",
    price: "Free",
    description: "Try Opelo with the interactive demo — no credit card, no setup.",
    features: [
      "Full demo environment",
      "AI policy engine",
      "Refund & escalation handling",
      "Meeting booking",
    ],
    cta: "See demo",
    ctaHref: "/dashboard",
    featured: false,
    badge: null,
  },
  {
    name: "Growth",
    price: "$49",
    per: "/mo",
    description: "For one-person businesses ready to hand off their operations inbox.",
    features: [
      "Everything in Starter",
      "Connect your real inbox",
      "SMS & voice channel support",
      "Custom policy rules",
      "Priority support",
    ],
    cta: "Coming soon",
    ctaHref: "#",
    featured: true,
    badge: "Coming soon",
  },
  {
    name: "Scale",
    price: "$149",
    per: "/mo",
    description: "For small teams handling high-volume client operations.",
    features: [
      "Everything in Growth",
      "Multiple team members",
      "Advanced analytics",
      "Custom integrations",
      "Dedicated onboarding",
    ],
    cta: "Coming soon",
    ctaHref: "#",
    featured: false,
    badge: "Coming soon",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      {/* Header */}
      <div className="text-center mb-14">
        <Link href="/" className="inline-flex items-center text-sm text-stone-400 hover:text-stone-600 transition mb-8">
          ← Back to home
        </Link>
        <h1 className="font-serif text-5xl text-stone-900 mt-4">Simple pricing</h1>
        <p className="mt-4 text-base text-stone-500 max-w-md mx-auto">
          Start for free. Pay only when you're ready to connect your real business.
        </p>
      </div>

      {/* Pricing cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative rounded-2xl border p-8 flex flex-col ${
              tier.featured
                ? "border-lime-300 bg-lime-50"
                : "border-stone-100 bg-white"
            }`}
          >
            {tier.badge && (
              <span className="absolute top-4 right-4 inline-flex items-center rounded-full bg-stone-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                {tier.badge}
              </span>
            )}

            <div className="mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-stone-400 mb-1">
                {tier.name}
              </h2>
              <div className="flex items-end gap-1">
                <span className="font-serif text-4xl text-stone-900">{tier.price}</span>
                {tier.per && <span className="text-stone-400 text-sm mb-1">{tier.per}</span>}
              </div>
              <p className="mt-3 text-sm text-stone-500 leading-relaxed">{tier.description}</p>
            </div>

            <ul className="space-y-2.5 mb-8 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-stone-600">
                  <span className="text-lime-500 font-bold">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href={tier.ctaHref}
              className={`block text-center rounded-full py-2.5 text-sm font-semibold transition ${
                tier.featured
                  ? "bg-stone-900 text-white hover:bg-stone-700"
                  : tier.badge
                  ? "border border-stone-200 bg-white text-stone-400 cursor-not-allowed pointer-events-none"
                  : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-stone-400 mt-10">
        No credit card needed to try Opelo · Pricing subject to change
      </p>
    </div>
  );
}
