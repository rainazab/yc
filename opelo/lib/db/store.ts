import { promises as fs } from "fs";
import path from "path";
import {
  ActionRecord,
  CompanyWallet,
  Customer,
  InboundMessage,
  OwnerSummary,
  Policies,
  WebhookEvent,
} from "../types";
import { nanoid } from "../integrations/util";
import {
  defaultPolicies,
  seedActions,
  seedCustomers,
  seedMessages,
  seedPendingInbound,
  seedWallet,
} from "./seed";

const DATA_DIR = path.join(process.cwd(), ".opelo-data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

interface Snapshot {
  business_name: string;
  business_description: string;
  owner_phone: string;
  policies: Policies;
  customers: Customer[];
  messages: InboundMessage[];
  actions: ActionRecord[];
  owner_summaries: OwnerSummary[];
  pending_inbound: InboundMessage[];
  wallet: CompanyWallet;
  webhook_events: WebhookEvent[];
  payment_links: StoredPaymentLink[];
  pending_owner_actions: PendingOwnerAction[];
}

export interface StoredPaymentLink {
  id: string;
  action_id: string;
  customer_id: string;
  business_name: string;
  description: string;
  amount_cents: number;
  stripe_url?: string;
  sponge_url?: string;
  status: "pending" | "paid";
  created_at: string;
}

export interface PendingOwnerAction {
  id: string;           // e.g. "poa_xxxx" — included in owner SMS for YES/NO replies
  action_id: string;    // ActionRecord.id this came from
  type: "approve_refund" | "approve_payment" | "review";
  description: string;  // human-readable: "Approve $450 refund for Alex Chen"
  customer_id: string;
  customer_phone?: string;
  amount_cents?: number;
  resolved: boolean;
  resolution?: "approved" | "declined";
  created_at: string;
}

let cache: Snapshot | null = null;
let writeLock: Promise<void> = Promise.resolve();

function initial(): Snapshot {
  return {
    business_name: "Opelo Demo Studio",
    business_description: "A demo workspace with customer messages about refunds, sponsorships, bookings, and pricing.",
    owner_phone: process.env.OWNER_PHONE_NUMBER || "",
    policies: defaultPolicies(),
    customers: seedCustomers(),
    messages: seedMessages(),
    actions: seedActions(),
    owner_summaries: [],
    pending_inbound: seedPendingInbound(),
    wallet: seedWallet(),
    webhook_events: [],
    payment_links: [],
    pending_owner_actions: [],
  };
}

function blankSnapshot(): Snapshot {
  return {
    business_name: "Your business",
    business_description: "",
    owner_phone: process.env.OWNER_PHONE_NUMBER || "",
    policies: defaultPolicies(),
    customers: [],
    messages: [],
    actions: [],
    owner_summaries: [],
    pending_inbound: [],
    wallet: { available_cents: 0, pending_cents: 0, refunded_today_cents: 0, revenue_generated_today_cents: 0, currency: "USD", updated_at: new Date().toISOString() },
    webhook_events: [],
    payment_links: [],
    pending_owner_actions: [],
  };
}

function blank(): Snapshot {
  return {
    business_name: "Your business",
    business_description: "",
    owner_phone: process.env.OWNER_PHONE_NUMBER || "",
    policies: defaultPolicies(),
    customers: [],
    messages: [],
    actions: [],
    owner_summaries: [],
    pending_inbound: [],
    wallet: {
      available_cents: 0,
      pending_cents: 0,
      refunded_today_cents: 0,
      revenue_generated_today_cents: 0,
      currency: "USD",
      updated_at: new Date().toISOString(),
    },
    webhook_events: [],
    payment_links: [],
    pending_owner_actions: [],
  };
}

async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

async function readSnapshot(): Promise<Snapshot> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    cache = JSON.parse(raw) as Snapshot;
    if (!cache.business_name) cache.business_name = "Opelo Demo Studio";
    if (typeof cache.business_description !== "string") cache.business_description = "";
    if (!cache.owner_summaries) cache.owner_summaries = [];
    if (!cache.pending_inbound) cache.pending_inbound = seedPendingInbound();
    if (!cache.wallet) cache.wallet = seedWallet();
    if (!cache.webhook_events) cache.webhook_events = [];
    if (!cache.payment_links) cache.payment_links = [];
    if (!cache.pending_owner_actions) cache.pending_owner_actions = [];
    if (!cache.owner_phone) cache.owner_phone = process.env.OWNER_PHONE_NUMBER || "";
    return cache;
  } catch {
    cache = initial();
    await persist();
    return cache;
  }
}

async function persist(): Promise<void> {
  if (!cache) return;
  await ensureDir();
  const data = JSON.stringify(cache, null, 2);
  await fs.writeFile(DATA_FILE, data, "utf8");
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = writeLock;
  let release: () => void = () => {};
  writeLock = new Promise<void>((res) => (release = res));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export const store = {
  async getBusinessName(): Promise<string> {
    const snap = await readSnapshot();
    return snap.business_name;
  },
  async setBusinessName(name: string): Promise<string> {
    return withLock(async () => {
      const snap = await readSnapshot();
      snap.business_name = name.trim() || "Your business";
      await persist();
      return snap.business_name;
    });
  },
  async getBusinessDescription(): Promise<string> {
    const snap = await readSnapshot();
    return snap.business_description;
  },
  async setBusinessDescription(description: string): Promise<string> {
    return withLock(async () => {
      const snap = await readSnapshot();
      snap.business_description = description.trim();
      await persist();
      return snap.business_description;
    });
  },
  async getOwnerPhone(): Promise<string> {
    const snap = await readSnapshot();
    return snap.owner_phone || process.env.OWNER_PHONE_NUMBER || "";
  },
  async setOwnerPhone(phone: string): Promise<string> {
    return withLock(async () => {
      const snap = await readSnapshot();
      snap.owner_phone = phone.trim();
      await persist();
      return snap.owner_phone;
    });
  },
  // ── Payment links (dual-rail: Stripe + Sponge) ────────────────────────────
  async savePaymentLink(link: StoredPaymentLink): Promise<StoredPaymentLink> {
    return withLock(async () => {
      const snap = await readSnapshot();
      snap.payment_links.unshift(link);
      await persist();
      return link;
    });
  },
  async getPaymentLink(id: string): Promise<StoredPaymentLink | null> {
    const snap = await readSnapshot();
    return snap.payment_links.find(l => l.id === id) ?? null;
  },
  async markPaymentLinkPaid(id: string): Promise<void> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const link = snap.payment_links.find(l => l.id === id);
      if (link) { link.status = "paid"; await persist(); }
    });
  },

  // ── Pending owner actions (YES/NO via SMS) ─────────────────────────────────
  async savePendingOwnerAction(action: PendingOwnerAction): Promise<PendingOwnerAction> {
    return withLock(async () => {
      const snap = await readSnapshot();
      snap.pending_owner_actions.unshift(action);
      await persist();
      return action;
    });
  },
  async getPendingOwnerAction(id: string): Promise<PendingOwnerAction | null> {
    const snap = await readSnapshot();
    return snap.pending_owner_actions.find(a => a.id === id && !a.resolved) ?? null;
  },
  async resolvePendingOwnerAction(id: string, resolution: "approved" | "declined"): Promise<void> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const action = snap.pending_owner_actions.find(a => a.id === id);
      if (action) { action.resolved = true; action.resolution = resolution; await persist(); }
    });
  },

  async getPolicies(): Promise<Policies> {
    const snap = await readSnapshot();
    return snap.policies;
  },
  async setPolicies(next: Policies): Promise<Policies> {
    return withLock(async () => {
      const snap = await readSnapshot();
      snap.policies = next;
      await persist();
      return snap.policies;
    });
  },
  async listCustomers(): Promise<Customer[]> {
    const snap = await readSnapshot();
    return snap.customers;
  },
  async getCustomer(id: string): Promise<Customer | undefined> {
    const snap = await readSnapshot();
    return snap.customers.find((c) => c.id === id);
  },
  async upsertCustomer(c: Customer): Promise<Customer> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const idx = snap.customers.findIndex((x) => x.id === c.id);
      if (idx >= 0) snap.customers[idx] = c;
      else snap.customers.push(c);
      await persist();
      return c;
    });
  },
  async listMessages(): Promise<InboundMessage[]> {
    const snap = await readSnapshot();
    return [...snap.messages].sort((a, b) =>
      b.received_at.localeCompare(a.received_at),
    );
  },
  async getMessage(id: string): Promise<InboundMessage | undefined> {
    const snap = await readSnapshot();
    return snap.messages.find((m) => m.id === id);
  },
  async addMessage(
    message: InboundMessage,
  ): Promise<{ inserted: boolean; message: InboundMessage }> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const dupById = snap.messages.find((m) => m.id === message.id);
      if (dupById) return { inserted: false, message: dupById };
      if (message.source_id) {
        const dupBySource = snap.messages.find(
          (m) => m.source_id === message.source_id,
        );
        if (dupBySource) return { inserted: false, message: dupBySource };
      }
      snap.messages.push(message);
      await persist();
      return { inserted: true, message };
    });
  },
  async updateMessageStatus(
    id: string,
    status: InboundMessage["status"],
  ): Promise<void> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const m = snap.messages.find((x) => x.id === id);
      if (m) m.status = status;
      await persist();
    });
  },
  async addAction(action: ActionRecord): Promise<ActionRecord> {
    return withLock(async () => {
      const snap = await readSnapshot();
      snap.actions.unshift(action);
      await persist();
      return action;
    });
  },
  async listActions(): Promise<ActionRecord[]> {
    const snap = await readSnapshot();
    return [...snap.actions].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  },
  async addOwnerSummary(s: OwnerSummary): Promise<OwnerSummary> {
    return withLock(async () => {
      const snap = await readSnapshot();
      snap.owner_summaries.unshift(s);
      await persist();
      return s;
    });
  },
  async listOwnerSummaries(): Promise<OwnerSummary[]> {
    const snap = await readSnapshot();
    return snap.owner_summaries;
  },
  async getWallet(): Promise<CompanyWallet> {
    const snap = await readSnapshot();
    return snap.wallet;
  },
  async applyRefund(amountCents: number): Promise<CompanyWallet> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const cents = Math.max(0, Math.round(amountCents));
      snap.wallet.available_cents = Math.max(
        0,
        snap.wallet.available_cents - cents,
      );
      snap.wallet.refunded_today_cents += cents;
      snap.wallet.updated_at = new Date().toISOString();
      await persist();
      return snap.wallet;
    });
  },
  async applyPaymentLinkCreated(amountCents: number): Promise<CompanyWallet> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const cents = Math.max(0, Math.round(amountCents));
      // Pending = pipeline created via a payment link. Available is unchanged
      // because the customer hasn't paid yet.
      snap.wallet.pending_cents += cents;
      snap.wallet.updated_at = new Date().toISOString();
      await persist();
      return snap.wallet;
    });
  },
  async applyRevenueGenerated(amountCents: number): Promise<CompanyWallet> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const cents = Math.max(0, Math.round(amountCents));
      snap.wallet.revenue_generated_today_cents += cents;
      snap.wallet.updated_at = new Date().toISOString();
      await persist();
      return snap.wallet;
    });
  },
  async addWebhookEvent(
    event: Omit<WebhookEvent, "id" | "created_at"> & {
      id?: string;
      created_at?: string;
    },
  ): Promise<WebhookEvent> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const full: WebhookEvent = {
        id: event.id ?? nanoid("wh"),
        created_at: event.created_at ?? new Date().toISOString(),
        provider: event.provider,
        event_type: event.event_type,
        payload: event.payload,
        parsed_kind: event.parsed_kind,
        inserted_message_id: event.inserted_message_id,
      };
      snap.webhook_events.unshift(full);
      if (snap.webhook_events.length > 200) {
        snap.webhook_events.length = 200;
      }
      await persist();
      return full;
    });
  },
  async updateWebhookEvent(
    id: string,
    patch: Partial<Pick<WebhookEvent, "parsed_kind" | "inserted_message_id">>,
  ): Promise<WebhookEvent | null> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const e = snap.webhook_events.find((w) => w.id === id);
      if (!e) return null;
      if (patch.parsed_kind !== undefined) e.parsed_kind = patch.parsed_kind;
      if (patch.inserted_message_id !== undefined) {
        e.inserted_message_id = patch.inserted_message_id;
      }
      await persist();
      return e;
    });
  },
  async listWebhookEvents(provider?: string): Promise<WebhookEvent[]> {
    const snap = await readSnapshot();
    const events = provider
      ? snap.webhook_events.filter((e) => e.provider === provider)
      : snap.webhook_events;
    return [...events];
  },
  async dequeueNextPending(): Promise<InboundMessage | null> {
    return withLock(async () => {
      const snap = await readSnapshot();
      const next = snap.pending_inbound.shift();
      if (!next) return null;
      next.received_at = new Date().toISOString();
      next.status = "new";
      snap.messages.push(next);
      await persist();
      return next;
    });
  },
  async pendingInboundCount(): Promise<number> {
    const snap = await readSnapshot();
    return snap.pending_inbound.length;
  },
  async reset(): Promise<void> {
    return withLock(async () => {
      cache = initial();
      await persist();
    });
  },
  async resetBlank(): Promise<void> {
    return withLock(async () => {
      cache = blank();
      await persist();
    });
  },
};
