import Link from "next/link";
import { store } from "@/lib/db/store";
import { ActionRecord, Customer, ActionType } from "@/lib/types";
import { AppIcon, AppIconName } from "@/components/AppIcon";
import { NewMessageButton } from "@/components/NewMessageButton";
import { BusinessRecommendation, RecommendationsPanel } from "@/components/RecommendationsPanel";

export const dynamic = "force-dynamic";

// Plain-English helpers
function actionIcon(t: ActionType): AppIconName {
  const map: Partial<Record<ActionType, AppIconName>> = {
    refund_issued: "refund",
    meeting_booked: "calendar",
    owner_escalated: "bell",
    sponsorship_countered: "chat",
    discount_offered: "chat",
    auto_reply_sent: "mail",
    sponsorship_declined: "x",
    lead_nurtured: "growth",
  };
  return map[t] ?? "spark";
}

function actionBadge(t: ActionType): { label: string; cls: string } {
  const map: Partial<Record<ActionType, { label: string; cls: string }>> = {
    refund_issued:         { label: "REFUND APPROVED",   cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    meeting_booked:        { label: "MEETING BOOKED",    cls: "text-sky-700     bg-sky-50     border-sky-200"     },
    owner_escalated:       { label: "NEEDS YOUR REVIEW", cls: "text-amber-700   bg-amber-50   border-amber-200"   },
    sponsorship_countered: { label: "COUNTER SENT",      cls: "text-violet-700  bg-violet-50  border-violet-200"  },
    discount_offered:      { label: "PRICE HELD",        cls: "text-blue-700    bg-blue-50    border-blue-200"    },
    auto_reply_sent:       { label: "REPLIED",           cls: "text-stone-700   bg-stone-100  border-stone-200"   },
  };
  return map[t] ?? { label: "HANDLED", cls: "text-stone-600 bg-stone-100 border-stone-200" };
}

function describeAction(a: ActionRecord, customers: Customer[]): string {
  const c = customers.find(x => x.id === a.customer_id);
  const first = c?.name?.split(" ")[0] ?? "A customer";
  const amt = a.revenue_delta ? `$${Math.abs(a.revenue_delta).toFixed(0)}` : "";
  switch (a.action_type) {
    case "refund_issued": return `${first} got a ${amt} refund processed`;
    case "meeting_booked": return `Meeting with ${first} is on the calendar`;
    case "owner_escalated": return `${first}'s request needs your personal attention`;
    case "sponsorship_countered": return `Sent ${first} a counter-offer for their sponsorship`;
    case "discount_offered": return `Held your pricing floor with ${first}`;
    case "auto_reply_sent": return `Replied to ${first}'s message`;
    default: return `Handled ${first}'s request`;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildRecommendations({
  actions,
  businessDescription,
  businessName,
  customers,
  messages,
  policies,
}: {
  actions: ActionRecord[];
  businessDescription: string;
  businessName: string;
  customers: Customer[];
  messages: Awaited<ReturnType<typeof store.listMessages>>;
  policies: Awaited<ReturnType<typeof store.getPolicies>>;
}): BusinessRecommendation[] {
  const pendingMessages = messages.filter((m) => m.status === "new");
  const reviewActions = actions.filter((a) => a.action_type === "owner_escalated");
  const bookedMeetings = actions.filter((a) => a.action_type === "meeting_booked");
  const counterOffers = actions.filter((a) => a.action_type === "sponsorship_countered" || a.action_type === "discount_offered");
  const recommendations: BusinessRecommendation[] = [];

  if (pendingMessages.length > 0) {
    const first = pendingMessages[0];
    const customer = customers.find((c) => c.id === first.customer_id);
    recommendations.push({
      id: "waiting-messages",
      icon: "inbox",
      title: `Handle ${pendingMessages.length} waiting ${pendingMessages.length === 1 ? "message" : "messages"}`,
      summary: `${customer?.name ?? "A customer"} is waiting. Let Opelo suggest the next reply.`,
      detail: "There are customer messages that have not been handled yet. Start with the newest one so Opelo can respond, book, refund, or bring you in when it needs your decision.",
      steps: [
        "Open Messages and choose the newest customer request.",
        "Let Opelo read the message and suggest a clear next move.",
        "Approve the response or adjust it before it goes out.",
      ],
      actionLabel: "Open Messages",
      href: "/inbox",
    });
  }

  if (reviewActions.length > 0) {
    const action = reviewActions[0];
    const customer = customers.find((c) => c.id === action.customer_id);
    recommendations.push({
      id: "review-needed",
      icon: "bell",
      title: `Make the call on ${customer?.name ?? "a customer request"}`,
      summary: "Opelo found something that needs your judgment before it moves forward.",
      detail: action.owner_summary || "This request needs your personal attention because it falls outside your usual rules.",
      steps: [
        "Read the customer context in Activity.",
        "Decide whether to approve, decline, or send a softer reply.",
        "Update My Rules if this kind of request should be handled differently next time.",
      ],
      actionLabel: "View Activity",
      href: "/logs",
    });
  }

  if (counterOffers.length > 0) {
    const latest = counterOffers[0];
    const customer = customers.find((c) => c.id === latest.customer_id);
    recommendations.push({
      id: "follow-up-offer",
      icon: "growth",
      title: "Follow up on an open offer",
      summary: `${customer?.name ?? "A customer"} got a price-safe reply. A short follow-up could help close it.`,
      detail: "Opelo protected your price. The next business move is a simple follow-up that keeps the conversation warm without discounting too quickly.",
      steps: [
        "Check the last reply Opelo sent.",
        "Send a short note asking if the customer wants to move forward.",
        `Keep the floor at $${policies.min_project_price} unless you intentionally change the rule.`,
      ],
      actionLabel: "Open Messages",
      href: "/inbox",
    });
  }

  if (bookedMeetings.length > 0) {
    recommendations.push({
      id: "prepare-meetings",
      icon: "calendar",
      title: "Prepare for booked calls",
      summary: `${bookedMeetings.length} ${bookedMeetings.length === 1 ? "meeting is" : "meetings are"} on the calendar. Turn them into next steps.`,
      detail: "Booked meetings are only useful if each one has a clear goal. Opelo can help keep the customer context close so the call starts smoothly.",
      steps: [
        "Review the customer request before the call.",
        "Write down the one outcome you want from the conversation.",
        "After the call, add the next promise or follow-up to Messages.",
      ],
      actionLabel: "View Activity",
      href: "/logs",
    });
  }

  if (recommendations.length < 3) {
    recommendations.push({
      id: "tighten-rules",
      icon: "rules",
      title: "Tighten one business rule",
      summary: `Your refund line is $${policies.refund_auto_approve_under}. Make sure it still feels right.`,
      detail: "Clear rules help Opelo act faster and ask fewer unnecessary questions. Pick one money or booking boundary and make it match how you actually run the business.",
      steps: [
        "Open My Rules.",
        "Check refund, booking, and minimum price amounts.",
        "Save the rule that would make tomorrow easier.",
      ],
      actionLabel: "Open My Rules",
      href: "/policies",
    });
  }

  if (recommendations.length < 3) {
    const setupDetail = businessDescription
      ? `Based on your setup notes, Opelo should start by handling the kind of customer request you described: "${businessDescription.slice(0, 140)}${businessDescription.length > 140 ? "..." : ""}"`
      : "Opelo needs one real customer request to learn the shape of your day-to-day work.";
    recommendations.push({
      id: "first-business-task",
      icon: "chat",
      title: `Start the first ${businessName} task`,
      summary: "Use one real customer message so Opelo can turn your setup into action.",
      detail: setupDetail,
      steps: [
        "Open Messages and add a request you would normally answer yourself.",
        "Let Opelo suggest the reply, booking, refund, or follow-up.",
        "Review Opelo's suggested response before sending.",
      ],
      actionLabel: "Open Messages",
      href: "/inbox",
    });
  }

  return recommendations.slice(0, 4);
}

export default async function DashboardPage() {
  const [businessName, businessDescription, policies, actions, customers, messages] = await Promise.all([
    store.getBusinessName(), store.getBusinessDescription(), store.getPolicies(), store.listActions(), store.listCustomers(), store.listMessages(),
  ]);
  const displayBusinessName = businessName === "Opelo Demo Studio" ? "your business" : businessName;

  // Simple stats
  const totalHandled = actions.length;
  const moneySaved = actions.reduce((sum, a) => {
    if (a.action_type === "refund_issued") return sum + Math.abs(a.revenue_delta || 0);
    if (a.revenue_delta > 0) return sum + a.revenue_delta;
    return sum;
  }, 0);
  const meetings = actions.filter(a => a.action_type === "meeting_booked").length;
  const needsReview = actions.filter(a => a.action_type === "owner_escalated").length;

  const recent = actions.slice(0, 8);
  const pendingMessages = messages.filter(m => m.status === "new");
  const recommendations = buildRecommendations({ actions, businessDescription, businessName: displayBusinessName, customers, messages, policies });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl leading-tight text-stone-900 sm:text-4xl">Get work done, {displayBusinessName}</h1>
          <p className="text-stone-400 text-sm mt-0.5">Here's what Opelo handled for you</p>
        </div>
        <NewMessageButton />
      </div>

      {/* Stat cards — Autosend style */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {[
          { icon: "inbox", label: "Requests handled", value: String(totalHandled), sub: "total this session" },
          { icon: "money", label: "Money saved & earned", value: `$${moneySaved.toFixed(0)}`, sub: "refunds + new revenue" },
          { icon: "calendar", label: "Meetings set up", value: String(meetings), sub: "auto-booked for you" },
          { icon: "bell", label: "Need your review", value: String(needsReview), sub: "waiting on you", highlight: needsReview > 0 },
        ].map(card => (
          <div key={card.label} className={`rounded-2xl border bg-white p-4 sm:p-5 ${card.highlight ? "border-amber-200" : "border-stone-100"}`}>
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${card.highlight ? "bg-amber-50 text-amber-600" : "bg-stone-50 text-stone-700"}`}>
              <AppIcon name={card.icon as AppIconName} />
            </div>
            <div className={`text-3xl font-semibold tracking-tight ${card.highlight ? "text-amber-600" : "text-stone-900"}`}>
              {card.value}
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-400 mt-1">{card.label}</div>
            <div className="text-xs text-stone-400 mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Pending messages banner */}
      {pendingMessages.length > 0 && (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-lime-200 bg-lime-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lime-700">
              <AppIcon name="inbox" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-lime-800">
                {pendingMessages.length} new {pendingMessages.length === 1 ? "message" : "messages"} waiting
              </p>
              <p className="text-xs text-lime-600">Opelo hasn't handled these yet — go to Messages to run them.</p>
            </div>
          </div>
          <Link href="/inbox" className="rounded-full bg-lime-400 px-4 py-1.5 text-xs font-semibold text-stone-900 transition hover:bg-lime-300">
            Open Messages →
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]">
        <RecommendationsPanel recommendations={recommendations} />

        {/* Activity section — Autosend campaign list style */}
        <div className="mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-stone-400 mb-4">
            Recent activity
          </h2>

          {recent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-6 text-center sm:p-10">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-50 text-lime-700">
                <AppIcon name="spark" />
              </div>
              <p className="font-semibold text-stone-700">Opelo hasn't handled anything yet</p>
              <p className="text-sm text-stone-400 mt-1">Go to Messages and run Opelo on your first request.</p>
              <Link href="/inbox" className="mt-4 inline-flex btn-primary">Go to Messages →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recent.map(a => {
                const c = customers.find(x => x.id === a.customer_id);
                const m = messages.find(x => x.id === a.message_id);
                const badge = actionBadge(a.action_type);
                return (
                  <div key={a.id} className="rounded-2xl border border-stone-100 bg-white px-4 py-4 sm:px-6">
                    {/* Row 1: badge + name + time */}
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-50 text-stone-700">
                          <AppIcon name={actionIcon(a.action_type)} className="h-4 w-4" />
                        </span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="text-sm font-semibold text-stone-800">
                          {c?.name ?? "Unknown"}
                        </span>
                      </div>
                      <span className="text-xs text-stone-400">{timeAgo(a.created_at)}</span>
                    </div>

                    {/* Row 2: plain description */}
                    <p className="text-sm text-stone-600 sm:pl-10">{describeAction(a, customers)}</p>

                    {/* Row 3: message subject if available */}
                    {m && (
                      <p className="mt-1 truncate text-xs text-stone-400 sm:pl-10">Re: {m.subject}</p>
                    )}

                    {/* Row 4: mini stats */}
                    <div className="mt-3 flex flex-wrap items-center gap-4 sm:gap-6 sm:pl-10">
                      {a.revenue_delta !== 0 && (
                        <Stat label="Money" value={`${a.revenue_delta > 0 ? "+" : "-"}$${Math.abs(a.revenue_delta).toFixed(0)}`} color={a.revenue_delta > 0 ? "emerald" : "rose"} />
                      )}
                      <Stat label="Result" value={a.decision.replace("_", " ")} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer hint */}
      {actions.length > 0 && (
        <div className="mt-6 text-center">
          <Link href="/logs" className="text-sm text-stone-400 hover:text-stone-600 transition">
            View full activity history →
          </Link>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color = "stone" }: { label: string; value: string; color?: string }) {
  const cls = color === "emerald" ? "text-emerald-700" : color === "rose" ? "text-rose-600" : "text-stone-600";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-stone-400">{label}</div>
      <div className={`text-xs font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
