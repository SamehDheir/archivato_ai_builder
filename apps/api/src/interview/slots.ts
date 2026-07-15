import {
  InterviewPhase,
  SLOT_KEYS,
  type InterviewExchange,
  type OpenQuestion,
  type SlotKey,
  type SlotMap,
} from '@archivato/shared';

/**
 * The synthetic question id for a "call notes" transcript entry (notes-first
 * mode). The interviewer prompt renders an entry with this id as labelled call
 * notes rather than a Q/A pair, and the service uses it to inject the notes as
 * `history[0]` before the normal adaptive loop runs — no parallel code path.
 */
export const NOTES_ENTRY_ID = 'call-notes';

/** Build the `history[0]` entry that carries the user's pasted call notes. */
export function notesHistoryEntry(notes: string): InterviewExchange {
  return {
    question: {
      id: NOTES_ENTRY_ID,
      phase: InterviewPhase.Understanding,
      prompt: 'Call notes / meeting transcript provided by the user.',
    },
    answer: notes.trim(),
  };
}

/**
 * The slot catalog — the facts a small dev shop needs to scope a client project.
 *
 * This is the **server-side** half of the slot model (the value shapes + the key
 * list are shared with the web; see `@archivato/shared`). Each entry carries a
 * short `description` used to brief the interviewer model on what the slot means,
 * and an `askClientTemplate`: a ready-to-send question the owner can forward to
 * their end client when they can't answer it themselves.
 *
 * Keyed by `SlotKey` (a `Record`, not an array) so the compiler forces every slot
 * to have a catalog entry — a new slot key can't be added to `SLOT_KEYS` without
 * describing it here. Order for display/prompts comes from `SLOT_KEYS`.
 */
export const SLOT_CATALOG: Record<
  SlotKey,
  { description: string; askClientTemplate: string }
> = {
  business_domain: {
    description:
      'The industry / problem space the software serves (e.g. e-commerce, clinic booking, logistics).',
    askClientTemplate:
      'What industry or business problem is this software for, in one or two sentences?',
  },
  target_users_roles: {
    description:
      'Who uses the system and in what role (admins, staff, customers, partners…).',
    askClientTemplate:
      'Who will use this system, and what different types of users (roles) are there?',
  },
  core_workflows: {
    description:
      'The main things users do end to end — the day-to-day flows the system must support.',
    askClientTemplate:
      'Walk me through the main things a user needs to do in the system, from start to finish.',
  },
  data_entities: {
    description:
      'The key things the system stores and relates (orders, patients, listings, shipments…).',
    askClientTemplate:
      'What are the main things the system needs to keep track of (records, items, documents)?',
  },
  integrations: {
    description:
      'External systems it must connect to — payment, messaging, maps, ERPs, existing APIs.',
    askClientTemplate:
      'Are there any existing tools or services this must connect to (payments, SMS/WhatsApp, maps, accounting, an existing system)?',
  },
  scale_expectations: {
    description:
      'Expected users / volume / growth — the load the system should be designed for.',
    askClientTemplate:
      'Roughly how many users or how much volume do you expect in the first year?',
  },
  constraints: {
    description:
      'Hard requirements or limits: tech mandates, hosting/region, compliance, deadlines that shape the design.',
    askClientTemplate:
      'Are there any hard requirements or limits — a required technology, hosting region, compliance (e.g. data residency), or a fixed launch date?',
  },
  budget_range: {
    description:
      'The budget the client has in mind for the build — the range that shapes scope and stack.',
    askClientTemplate:
      'What budget range do you have in mind for building this? Even a rough range helps us right-size the proposal.',
  },
  timeline: {
    description:
      'When the client needs it delivered — the deadline or window that shapes phasing.',
    askClientTemplate:
      'When do you need this delivered? Is there a launch date or deadline driving it?',
  },
  existing_assets: {
    description:
      'What already exists to build on: designs, a current system, brand assets, an API, a team.',
    askClientTemplate:
      'Is there anything already in place we should build on — an existing system, designs, brand assets, or an API?',
  },
};

/**
 * Domain-specific follow-up hints, injected into the interviewer prompt when the
 * intent analysis matches. Kept in **code** (not left to the model) so they are
 * testable and editable, and so a given domain always probes the same known
 * high-value questions. The key is matched loosely against the analysed domain.
 */
export const DOMAIN_FOLLOW_UPS: Record<string, string[]> = {
  'e-commerce': [
    'How are payments taken, and in which currencies/countries?',
    'Is there one seller or many (single store vs multi-vendor)?',
    'How are shipping, tax, and returns handled?',
    'Is there inventory/stock tracking?',
  ],
  marketplace: [
    'Who are the two sides of the marketplace, and how do they find each other?',
    'How does the platform take its cut (commission, subscription, listing fee)?',
    'How is trust handled — reviews, verification, disputes?',
    'How do payouts to sellers/providers work?',
  ],
  'booking/reservations': [
    'What exactly is being booked, and what defines availability?',
    'How are cancellations, no-shows, and rescheduling handled?',
    'Is payment taken at booking, on arrival, or both?',
    'Are there reminders/notifications, and on which channels?',
  ],
  'delivery/logistics': [
    'What is being moved, from where to where?',
    'How are drivers/couriers assigned and tracked?',
    'Is there real-time tracking or route optimization?',
    'How is proof of delivery captured?',
  ],
  'saas-internal-tool': [
    'Is this multi-tenant (many customer orgs) or single-org internal?',
    'What does the permission/role model need to cover?',
    'Does it need audit logging or reporting/exports?',
    'What does onboarding a new team/tenant look like?',
  ],
  education: [
    'Who are the learners and the instructors/admins?',
    'Is content self-paced, live/cohort, or both?',
    'How is progress/assessment tracked and certified?',
    'Is there payment, and per-course or subscription?',
  ],
  healthcare: [
    'What patient/clinical data is stored, and what are the privacy/compliance needs?',
    'Who are the roles (patients, clinicians, admin/reception)?',
    'How are appointments, records, and notifications handled?',
    'Does it integrate with any existing clinical or billing systems?',
  ],
};

/**
 * The domain follow-up hints for an analysed domain, or `[]` if the domain isn't
 * one we have hints for. Matching is loose (case-insensitive substring both
 * ways) so `"healthcare / clinics"` still matches the `healthcare` bucket.
 */
export function domainFollowUps(domain: string | null | undefined): string[] {
  if (!domain) return [];
  const d = domain.toLowerCase();
  for (const [key, hints] of Object.entries(DOMAIN_FOLLOW_UPS)) {
    const k = key.toLowerCase();
    if (d.includes(k) || k.includes(d) || sharesToken(d, k)) return hints;
  }
  return [];
}

/** Loose match so "online store" ↔ "e-commerce" style near-misses still connect. */
function sharesToken(a: string, b: string): boolean {
  const tokens = (s: string) => s.split(/[^a-z]+/).filter((t) => t.length >= 4);
  const bt = new Set(tokens(b));
  return tokens(a).some((t) => bt.has(t));
}

/**
 * Merge a fresh slot snapshot from a turn onto the accumulated one.
 *
 * The rule, in one line: **a later explicit value beats an earlier inferred one,
 * never the reverse.** Concretely, per incoming key:
 *   - explicit  → always wins (a stated answer supersedes anything before it);
 *   - inferred  → wins only if the existing value is absent or itself inferred
 *     (an inference must never overwrite something the user actually said).
 * Keys the incoming snapshot doesn't mention are left untouched — a turn that
 * fills one slot must not wipe the others.
 *
 * Pure and total; returns a new object.
 */
export function mergeSlots(
  existing: SlotMap,
  incoming: SlotMap | undefined,
): SlotMap {
  if (!incoming) return { ...existing };
  const merged: SlotMap = { ...existing };
  for (const key of Object.keys(incoming) as SlotKey[]) {
    const next = incoming[key];
    if (!next || !isSlotKey(key)) continue;
    const prev = merged[key];
    if (!prev) {
      merged[key] = next;
    } else if (next.source === 'explicit') {
      merged[key] = next; // a stated value always supersedes
    } else if (prev.source !== 'explicit') {
      merged[key] = next; // inferred may refresh inferred, never an explicit
    }
    // else: incoming is inferred but we already have explicit → keep explicit.
  }
  return merged;
}

/**
 * Reconcile the open-question list after a turn.
 *
 * Incoming entries (the model's "the owner didn't know X") are merged by slot
 * key, newest winning; then any entry whose slot is now filled with a real value
 * is dropped — an answered gap is no longer open. Slots explicitly marked `na`
 * don't count as answered (the model may still want to flag them), and an
 * inferred value doesn't clear a question either: an inference is a guess, and
 * the whole point of an open question is to have the client confirm it.
 *
 * Pure; returns a new array in stable slot order.
 */
export function reconcileOpenQuestions(
  existing: OpenQuestion[],
  incoming: OpenQuestion[] | undefined,
  slots: SlotMap,
): OpenQuestion[] {
  const byKey = new Map<string, OpenQuestion>();
  for (const q of existing) byKey.set(q.slotKey, q);
  for (const q of incoming ?? []) {
    if (q && typeof q.slotKey === 'string' && q.questionForClient) {
      byKey.set(q.slotKey, q);
    }
  }
  const answered = (key: string): boolean => {
    const slot = isSlotKey(key) ? slots[key] : undefined;
    return (
      !!slot &&
      !slot.na &&
      slot.source === 'explicit' &&
      slot.value.trim().length > 0
    );
  };
  const order = new Map(SLOT_KEYS.map((k, i) => [k as string, i]));
  return [...byKey.values()]
    .filter((q) => !answered(q.slotKey))
    .sort((a, b) => (order.get(a.slotKey) ?? 99) - (order.get(b.slotKey) ?? 99));
}

/** A ready-to-forward client question for a slot, from its catalog template. */
export function openQuestionForSlot(slotKey: SlotKey): OpenQuestion {
  return {
    slotKey,
    questionForClient: SLOT_CATALOG[slotKey].askClientTemplate,
  };
}

/** Narrow an arbitrary string to a known slot key. */
export function isSlotKey(value: string): value is SlotKey {
  return (SLOT_KEYS as readonly string[]).includes(value);
}
