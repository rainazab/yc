import Link from "next/link";
import { AppIcon, AppIconName } from "@/components/AppIcon";

const values = [
  { icon: "spark", text: "Built for people who do everything themselves — and shouldn't have to." },
  { icon: "handshake", text: "Your clients deserve a fast, thoughtful response every time. Opelo makes that possible." },
  { icon: "rules", text: "Rules you write. Opelo follows them — even when you're unavailable." },
  { icon: "bell", text: "You stay in control. Opelo handles the routine, escalates the unusual." },
  { icon: "growth", text: "Starts simple. Gets smarter. The longer it runs, the better it knows your business." },
] satisfies { icon: AppIconName; text: string }[];

export default function CompanyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      {/* Back link */}
      <Link href="/" className="mb-10 inline-flex items-center gap-1.5 text-sm text-stone-400 transition hover:text-stone-600">
        <AppIcon name="back" className="h-4 w-4" />
        Back to home
      </Link>

      {/* Heading */}
      <h1 className="font-serif text-5xl text-stone-900 leading-tight mb-6">
        Built for the one-person business
      </h1>

      {/* Mission */}
      <p className="text-base text-stone-600 leading-relaxed mb-4">
        Opelo started with a simple observation: the hardest part of running a one-person business
        isn't the work itself — it's all the operational overhead that surrounds it. Refund requests,
        scheduling emails, pricing negotiations, sponsorship inquiries. Hours every week that pull
        you away from what you're actually good at.
      </p>
      <p className="text-base text-stone-600 leading-relaxed mb-10">
        We built Opelo to be the AI middle manager that one-person businesses have never had access
        to. It reads your policies, learns your clients, and makes the right call — so you can stay
        focused on the work that only you can do.
      </p>

      {/* Values */}
      <div className="border-t border-stone-100 pt-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-6">
          What we believe
        </h2>
        <ul className="space-y-5">
        {values.map((v) => (
            <li key={v.text} className="flex items-start gap-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-50 text-stone-600">
                <AppIcon name={v.icon} className="h-4 w-4" />
              </span>
              <p className="text-base text-stone-600 leading-relaxed">{v.text}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="mt-14 rounded-2xl border border-stone-100 bg-stone-50 p-8 text-center">
        <p className="font-serif text-2xl text-stone-900 mb-3">Ready to try it?</p>
        <p className="text-sm text-stone-500 mb-6">See Opelo handle a real set of business requests — no setup required.</p>
        <Link href="/get-started" className="inline-flex btn-primary">
          Get Started →
        </Link>
      </div>
    </div>
  );
}
