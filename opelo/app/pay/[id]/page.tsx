import { notFound } from "next/navigation";
import { store } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: { id: string } }) {
  const link = await store.getPaymentLink(params.id);
  if (!link) notFound();

  const amountStr  = `$${(link.amount_cents / 100).toFixed(2)}`;
  const isPaid     = link.status === "paid";
  const hasStripe  = !!link.stripe_url;
  const hasSponge  = !!link.sponge_url;

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-stone-100 px-6 py-4 flex items-center justify-between">
        <span className="font-serif text-lg text-stone-900">{link.business_name}</span>
        <span className="text-xs text-stone-400">Powered by Opelo</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {isPaid ? (
            <PaidConfirmation businessName={link.business_name} description={link.description} amount={amountStr} />
          ) : (
            <PaymentOptions
              link={link}
              amountStr={amountStr}
              hasStripe={hasStripe}
              hasSponge={hasSponge}
            />
          )}
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-stone-400">
        This payment is securely handled by {hasStripe ? "Stripe" : ""}{hasStripe && hasSponge ? " & " : ""}{hasSponge ? "Sponge" : ""}
      </footer>
    </div>
  );
}

function PaymentOptions({
  link,
  amountStr,
  hasStripe,
  hasSponge,
}: {
  link: { description: string; stripe_url?: string; sponge_url?: string };
  amountStr: string;
  hasStripe: boolean;
  hasSponge: boolean;
}) {
  return (
    <div>
      {/* Amount card */}
      <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-card mb-6">
        <div className="text-5xl font-serif font-semibold text-stone-900 mb-2">{amountStr}</div>
        <p className="text-stone-500 text-sm">{link.description}</p>
      </div>

      {/* Payment options */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 text-center mb-4">
          Choose how to pay
        </p>

        {/* Stripe — card payment */}
        {hasStripe && (
          <a
            href={link.stripe_url}
            className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-stone-400 hover:shadow-soft group"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-2xl">
              💳
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-stone-900 group-hover:text-stone-700">Pay by card</div>
              <div className="text-xs text-stone-400 mt-0.5">Credit or debit · Visa, Mastercard, Amex</div>
            </div>
            <svg className="h-4 w-4 text-stone-400 group-hover:text-stone-700 transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        )}

        {/* Sponge — crypto payment */}
        {hasSponge && (
          <a
            href={link.sponge_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-lime-300 hover:shadow-soft group"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-lime-50 text-2xl">
              ⚡
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-stone-900 group-hover:text-lime-700">Pay with crypto</div>
              <div className="text-xs text-stone-400 mt-0.5">USDC on Solana or Base · Instant settlement</div>
            </div>
            <svg className="h-4 w-4 text-stone-400 group-hover:text-lime-600 transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        )}

        {/* Fallback when neither is configured */}
        {!hasStripe && !hasSponge && (
          <div className="rounded-2xl border border-stone-100 bg-stone-50 p-6 text-center text-sm text-stone-400">
            Payment methods are being set up. Please check back shortly.
          </div>
        )}
      </div>

      {/* Trust signals */}
      <div className="mt-8 flex items-center justify-center gap-6 text-xs text-stone-400">
        <span className="flex items-center gap-1">🔒 Secure checkout</span>
        <span className="flex items-center gap-1">✉️ Instant confirmation</span>
      </div>
    </div>
  );
}

function PaidConfirmation({
  businessName,
  description,
  amount,
}: {
  businessName: string;
  description: string;
  amount: string;
}) {
  return (
    <div className="rounded-3xl border border-emerald-200 bg-white p-10 text-center shadow-card">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl mx-auto mb-4">
        ✅
      </div>
      <h1 className="font-serif text-2xl text-stone-900 mb-2">Payment received!</h1>
      <p className="text-stone-500 text-sm mb-4">
        {amount} for {description}
      </p>
      <p className="text-xs text-stone-400">
        {businessName} will be in touch with next steps. A confirmation has been sent to you.
      </p>
    </div>
  );
}
