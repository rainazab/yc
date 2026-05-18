import Link from "next/link";
import { store } from "@/lib/db/store";
import { ChannelBadge, DecisionBadge } from "@/components/Badges";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const [actions, customers, messages] = await Promise.all([
    store.listActions(), store.listCustomers(), store.listMessages(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="label">Activity</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
            Everything Opelo has helped with
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            A simple history of customer messages, replies, refunds, bookings, and anything that needed your attention.
          </p>
        </div>
        <Link href="/inbox" className="btn-primary shrink-0">Open Messages</Link>
      </div>

      {actions.length === 0 ? (
        <div className="card p-6 text-sm text-stone-400">
          Nothing here yet. Open{" "}
          <Link className="font-medium text-stone-700 underline underline-offset-2" href="/inbox">Inbox</Link>{" "}
          when you are ready for Opelo to help with the first message.
        </div>
      ) : (
        <ol className="space-y-4">
          {actions.map((a) => {
            const m = messages.find((x) => x.id === a.message_id);
            const c = customers.find((x) => x.id === a.customer_id);
            return (
              <li key={a.id} className="card p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <DecisionBadge value={a.decision} />
                  {m && <ChannelBadge value={m.channel} />}
                  {a.llm_used && (
                    <span className="pill border-lime-200 bg-lime-50 text-lime-700">Personalized</span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-stone-400">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  <div>
                    <div className="label">Customer message</div>
                    <p className="mt-1.5 text-xs text-stone-400">{c?.name} · {c?.email}</p>
                    {m && <p className="mt-1 text-sm font-medium text-stone-900">{m.subject}</p>}
                    {m && <p className="mt-1 text-sm leading-relaxed text-stone-600 whitespace-pre-wrap">{m.body}</p>}
                  </div>
                  <div>
                    <div className="label">Rule Opelo used</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{a.policy_applied}</p>
                    <div className="label mt-4">Quick summary</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{a.owner_summary}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="label mb-2">Reply sent</div>
                  <pre className="whitespace-pre-wrap rounded-xl border border-stone-100 bg-stone-50 p-4 font-sans text-sm leading-relaxed text-stone-700">
                    {a.customer_response}
                  </pre>
                </div>

                <div className="mt-4">
                  <div className="label mb-2">What happened</div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {a.mock_external_actions.map((act, i) => (
                      <li key={act.ref + i} className="flex items-start gap-3 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-xs">
                        <span className={act.ok ? "text-emerald-600" : "text-rose-600"}>{act.ok ? "✓" : "!"}</span>
                        <span>
                          <span className="block font-medium text-stone-800">{friendlyActionName(act.name)}</span>
                          {act.detail && <span className="mt-0.5 block text-stone-500">{friendlyActionDetail(act.detail)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      )}
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
