/**
 * **The proposal cover letter (R13)** — the message a dev shop pastes into
 * Mostaql / Upwork / an email *alongside* the scoping link.
 *
 * This is the last step of the pivot's core promise. Everything upstream turns a
 * client call into a scoping package in an hour; this turns that package into a
 * submitted bid. Without it the owner still writes the covering message by hand —
 * the one part of the deal they were already doing, and the part that decides
 * whether the link ever gets opened.
 *
 * Pure and runtime-free: the API generates with it and the web renders counters
 * and warnings from the same constants, so the two can never disagree about what
 * "too long" means.
 *
 * Four rules hold it together:
 *
 * 1. **The message speaks only about THIS proposal's content.** Never past
 *    experience, team size, portfolios, or credentials — we have no idea whether
 *    any of that is true, and a fabricated credential in a bid is a lie the owner
 *    signs their name to. See `HONESTY_RULES`, which the agent's prompt embeds
 *    verbatim and a test pins.
 * 2. **The model never invents a price.** It receives the owner's exact words or
 *    no price at all — `ProposalInput.price` is simply absent when the owner
 *    didn't opt in, which is the enforcement (the prompt cannot leak a figure it
 *    was never given).
 * 3. **Over-length is shown, never truncated.** A message cut at 900 characters
 *    ends mid-thought, and the owner may paste it anyway. See `PROPOSAL_CEILINGS`.
 * 4. **Arabic output is deliberate here, and is NOT the deferred GREEN item.**
 *    Generated *artifacts* stay server-side English. This isn't an artifact — it's
 *    the owner's own outbound message to their client, and a Mostaql bid written
 *    in English is a bid that loses.
 */

/** Where the message is going. Drives language default, tone, and length ceiling. */
export const PROPOSAL_CHANNELS = ['upwork', 'mostaql', 'email', 'generic'] as const;
export type ProposalChannel = (typeof PROPOSAL_CHANNELS)[number];

/** The message's language. Independent of the app's UI locale. */
export const PROPOSAL_LOCALES = ['en', 'ar'] as const;
export type ProposalLocale = (typeof PROPOSAL_LOCALES)[number];

/** Whether a draft came from the model or the deterministic template. */
export type ProposalSource = 'llm' | 'fallback';

export function isProposalChannel(value: unknown): value is ProposalChannel {
  return PROPOSAL_CHANNELS.includes(value as ProposalChannel);
}

export function isProposalLocale(value: unknown): value is ProposalLocale {
  return PROPOSAL_LOCALES.includes(value as ProposalLocale);
}

// ── Length ceilings (edit here — one file, per the task) ─────────────────────

/**
 * Maximum characters per channel. These are platform realities, not style
 * preferences: a Mostaql bid is read in a list next to a dozen others, and an
 * Upwork cover letter is collapsed after a few lines.
 *
 * **Truncation is never allowed.** A message cut at the ceiling ends mid-sentence
 * — and the owner, who asked for a ready-to-send message, may well paste it
 * without re-reading. So an over-long draft is *shown* with a warning and left
 * for them to trim: their judgement about what to cut beats our substring.
 */
export const PROPOSAL_CEILINGS: Record<ProposalChannel, number> = {
  upwork: 900,
  mostaql: 700,
  email: 1200,
  generic: 900,
};

/**
 * The channel's default language, or null when the channel has no opinion and the
 * project's own locale decides. Mostaql is an Arabic-first marketplace; Upwork is
 * English-first. Always user-overridable — a MENA shop bidding on a Gulf client's
 * English Upwork post knows better than this table does.
 */
export const CHANNEL_DEFAULT_LOCALE: Record<ProposalChannel, ProposalLocale | null> = {
  upwork: 'en',
  mostaql: 'ar',
  email: null,
  generic: null,
};

/**
 * Resolve the message language: an explicit choice wins, then the channel's
 * default, then the project's locale, then English.
 */
export function resolveProposalLocale(
  channel: ProposalChannel,
  requested?: ProposalLocale | null,
  projectLocale?: string | null,
): ProposalLocale {
  if (requested && isProposalLocale(requested)) return requested;
  const byChannel = CHANNEL_DEFAULT_LOCALE[channel];
  if (byChannel) return byChannel;
  return isProposalLocale(projectLocale) ? projectLocale : 'en';
}

/**
 * The message's length as a platform counts it — code points, not UTF-16 units,
 * so an emoji in a client's project name costs 1 rather than 2. Trimmed, because
 * trailing whitespace is not something to warn an owner about.
 */
export function proposalCharCount(message: string): number {
  return [...message.trim()].length;
}

export function isOverLength(message: string, channel: ProposalChannel): boolean {
  return proposalCharCount(message) > PROPOSAL_CEILINGS[channel];
}

// ── Honesty constraints ─────────────────────────────────────────────────────

/**
 * The claims the message may never make, embedded verbatim in the agent's prompt
 * and pinned by a test.
 *
 * We know exactly one thing about the sender: the scoping they just generated. We
 * do not know their team size, their track record, or whether they have ever
 * shipped anything. An LLM writing a "cover letter" will reach for that register
 * by default — "with over a decade of experience delivering…" — and every word of
 * it would be invented. The owner then puts their name on it and sends it to a
 * buyer who may check.
 */
export const HONESTY_RULES: readonly string[] = [
  'NEVER claim past experience, years in business, team size, portfolio, past clients, credentials, certifications, or reviews — you know none of these and inventing one puts a lie in the sender’s bid.',
  'NEVER use superlatives about the sender ("expert", "leading", "best", "world-class", "passionate").',
  'Speak ONLY about the content of THIS proposal: what was understood, what is in scope, how long it takes, and what it costs.',
  'Do NOT invent a price, a discount, a start date, or a guarantee. Use only figures you are given.',
];

// ── Inputs ──────────────────────────────────────────────────────────────────

/**
 * The scoping facts the message is written FROM. Everything optional is genuinely
 * optional: a free-plan project has no effort estimate, and a plan-mode run has no
 * executive summary.
 */
export interface ProposalFacts {
  /** The project's display name (the owner's title, else the idea). */
  title: string;
  /** The client's original idea, in their words. */
  idea: string;
  /** R7's jargon-free client-facing summary — the best "what we understood" source. */
  executiveSummary?: string;
  /** Top capabilities in the user-outcome voice (R7), already trimmed to 3–5. */
  capabilities: string[];
  /** R9's deterministic effort range, in person-weeks. */
  effortWeeksMin?: number;
  effortWeeksMax?: number;
  /** R10's phase-1 MVP statement — what's usable first. */
  mvpStatement?: string;
  /** The client's stated timeline, in their own words (the interview slot). */
  timeline?: string;
  /** The public scoping page. The reason the message exists. */
  shareUrl: string;
}

/**
 * Everything the writer sees. `locale` is already resolved, and **`price` is
 * present if and only if the owner opted in** — that absence is the enforcement,
 * not a prompt instruction the model might disregard.
 */
export interface ProposalInput {
  channel: ProposalChannel;
  locale: ProposalLocale;
  clientName?: string;
  senderName?: string;
  companyName?: string;
  /** The owner's exact price words, inserted verbatim. Never re-derived or formatted. */
  price?: string;
  /** A line the owner wants woven in (e.g. a reference to the client's posting). */
  customHook?: string;
  /**
   * Which draft this is. `0` is the first; each "Regenerate" increments it, which
   * tells the model to take a different angle and rotates the deterministic
   * template's hook and closing — so regenerating changes something offline too,
   * while staying a pure function of its input.
   */
  variant: number;
  facts: ProposalFacts;
}

/**
 * The owner's controls, as sent to `POST /proposal/:id/generate` (the API's
 * `GenerateProposalDto` mirrors and validates this).
 *
 * Note the shape difference from `ProposalInput`: here the price is guarded by
 * `includePrice`, because this is a *form*, and a form remembers what you typed
 * even after you untick the box. The service resolves the two into
 * `ProposalInput`, where a price is either present or does not exist — so the
 * boundary between "the owner is considering a price" and "the model knows a
 * price" is one explicit step, in one place.
 */
export interface ProposalControls {
  channel: ProposalChannel;
  /** Explicit language override; omitted ⇒ the channel default, then `projectLocale`. */
  locale?: ProposalLocale;
  /** The owner's working locale — used only where the channel has no opinion. */
  projectLocale?: ProposalLocale;
  clientName?: string;
  senderName?: string;
  companyName?: string;
  /** Defaults false. Pricing in the covering message is a per-bid decision. */
  includePrice?: boolean;
  /** Read only when `includePrice` is true. */
  price?: string;
  customHook?: string;
  /** 0 for the first draft; incremented by "Regenerate" to ask for a new angle. */
  variant?: number;
}

// ── Drafts ──────────────────────────────────────────────────────────────────

/** How many drafts a project keeps. Older ones fall off the end. */
export const PROPOSAL_DRAFT_LIMIT = 5;

export interface ProposalDraft {
  id: string;
  channel: ProposalChannel;
  locale: ProposalLocale;
  /** The message itself — plain text, ready to paste. */
  message: string;
  charCount: number;
  /** The ceiling that applied, stored so a re-read renders the same warning. */
  ceiling: number;
  /**
   * The model couldn't get under the ceiling even after the shorten retry. The UI
   * shows the draft with a warning chip; it is never silently cut.
   */
  overLength: boolean;
  /** The link embedded in the message, kept separate for platforms with a link field. */
  shareUrl: string;
  /** Whether a price was included — never the price itself; the message carries it. */
  includedPrice: boolean;
  source: ProposalSource;
  createdAt: string;
}

/**
 * Add a draft to the project's history, newest first, capped at
 * `PROPOSAL_DRAFT_LIMIT`.
 *
 * Newest-first (unlike R11's `appendFixLog`, which is an append-only audit log
 * read oldest-first) because this is an outbox, not a record: the owner wants the
 * draft they just made, and the one before it to compare against. The cap is why
 * this is a helper rather than a spread at the call site — an uncapped list would
 * grow a JSON column without bound, one LLM-length message at a time.
 */
export function appendProposalDraft(
  history: ProposalDraft[] | null | undefined,
  draft: ProposalDraft,
): ProposalDraft[] {
  return [draft, ...(history ?? [])].slice(0, PROPOSAL_DRAFT_LIMIT);
}

// ── Capability selection ────────────────────────────────────────────────────

/** Priority order for picking the capabilities worth naming in a short message. */
const PRIORITY_RANK: Record<string, number> = { must: 0, should: 1, could: 2 };

/**
 * The 3–5 capabilities the message names — "must" first, since a cover letter has
 * room for the spine of the build and nothing else. Titles, not descriptions: R7
 * already phrases functional requirements in the user-outcome voice ("Customers
 * can track their orders"), which is exactly the register a client reads in.
 */
export function topCapabilities(
  functional: readonly { title: string; priority: string }[] | undefined,
  limit = 5,
): string[] {
  return [...(functional ?? [])]
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3))
    .map((f) => f.title?.trim())
    .filter((title): title is string => !!title)
    .slice(0, limit);
}

// ── Deterministic fallback ──────────────────────────────────────────────────

/** Sentence terminators, Arabic included (؟ ۔ and the Arabic comma-free full stop). */
const SENTENCE_END = /(?<=[.!?؟۔])\s+/;

/** The first `n` sentences of a block of prose, or '' when there are none. */
function firstSentences(text: string | undefined, n: number): string {
  if (!text || n <= 0) return '';
  return text.trim().split(SENTENCE_END).slice(0, n).join(' ').trim();
}

/** Drop empty blocks and join the rest with blank lines (short paragraphs). */
function paragraphs(blocks: (string | undefined | false)[]): string {
  return blocks.filter((b): b is string => !!b && !!b.trim()).join('\n\n');
}

/** Rotate a variant over a list of alternatives (pure — same variant, same pick). */
function pick<T>(options: readonly T[], variant: number): T {
  const i = Math.abs(Math.trunc(variant)) % options.length;
  return options[i];
}

/** Localized copy for the deterministic template. */
interface Copy {
  greeting: (client?: string) => string;
  hooks: readonly ((title: string) => string)[];
  understood: (summary: string) => string;
  scope: (caps: string[]) => string;
  link: (url: string) => string;
  effort: (min: number, max: number, timeline?: string) => string;
  timelineOnly: (timeline: string) => string;
  price: (price: string) => string;
  closings: readonly string[];
  signoff: (sender?: string, company?: string) => string;
}

const EN: Copy = {
  greeting: (client) => (client ? `Hi ${client},` : 'Hi,'),
  hooks: [
    (title) => `About ${title} — I scoped the whole thing out before writing to you.`,
    (title) => `I read through what you need for ${title} and scoped the build end to end.`,
    (title) => `Rather than send you a rough estimate for ${title}, I scoped it properly first.`,
  ],
  understood: (summary) => `Here's what I understood: ${summary}`,
  scope: (caps) => `In scope: ${caps.join(' · ')}.`,
  link: (url) =>
    `The full scoping — requirements, architecture, cost and roadmap — is here: ${url}`,
  effort: (min, max, timeline) =>
    `Estimated build: ${formatRange(min, max)} weeks${
      timeline ? ` (you mentioned ${timeline})` : ''
    }.`,
  timelineOnly: (timeline) => `You mentioned ${timeline} — the scoping covers what fits.`,
  price: (price) => `Price: ${price}.`,
  closings: [
    'Which part do you need working first? That usually decides how phase one is shaped.',
    "What's driving the deadline on your side? It changes what I'd put in phase one.",
    "Is there anything here you'd rather drop from the first version? Happy to re-scope around it.",
  ],
  signoff: (sender, company) => signature(sender, company, ', '),
};

/**
 * Arabic copy — warm, professional, **فصحى مبسطة** rather than stiff MSA. A bid on
 * Mostaql written in textbook formal Arabic reads like a government circular; one
 * written in dialect reads unprofessional. This sits between, which is how the
 * market actually writes.
 *
 * Numbers stay Latin, per the `useFormat` convention (Arabic locale renders Latin
 * numerals for legibility) — and because a price or week count in Arabic-Indic
 * digits pasted into Upwork is a support ticket waiting to happen.
 */
const AR: Copy = {
  greeting: (client) => (client ? `أهلاً ${client}،` : 'أهلاً وسهلاً،'),
  hooks: [
    (title) => `بخصوص ${title} — أعددت دراسة كاملة لنطاق العمل قبل إرسال هذا العرض.`,
    (title) => `اطّلعت على ما تحتاجه في ${title}، وحدّدت نطاق التنفيذ من البداية للنهاية.`,
    (title) => `بدل إرسال تقدير سريع لـ ${title}، فضّلت دراسته بشكل كامل أولاً.`,
  ],
  understood: (summary) => `ما فهمته من طلبك: ${summary}`,
  scope: (caps) => `نطاق العمل يشمل: ${caps.join(' · ')}.`,
  link: (url) => `تفاصيل النطاق كاملة — المتطلبات والبنية التقنية والتكلفة وخطة التنفيذ — من هنا: ${url}`,
  effort: (min, max, timeline) =>
    `مدة التنفيذ التقديرية: ${formatRange(min, max)} أسبوعاً${
      timeline ? ` (الجدول الذي ذكرته: ${timeline})` : ''
    }.`,
  timelineOnly: (timeline) => `ذكرت جدولاً زمنياً قدره ${timeline} — والدراسة توضّح ما يمكن إنجازه ضمنه.`,
  price: (price) => `السعر: ${price}.`,
  closings: [
    'أي جزء تحتاجه جاهزاً أولاً؟ عادةً هذا ما يحدّد شكل المرحلة الأولى.',
    'ما الذي يحكم الموعد النهائي لديك؟ ذلك يغيّر ما أضعه في المرحلة الأولى.',
    'هل هناك جزء تفضّل تأجيله عن النسخة الأولى؟ يسعدني إعادة ترتيب النطاق حوله.',
  ],
  signoff: (sender, company) => signature(sender, company, '، '),
};

const COPY: Record<ProposalLocale, Copy> = { en: EN, ar: AR };

/** "8–12" for a range, "8" when both ends agree. Halves survive (7.5 stays 7.5). */
function formatRange(min: number, max: number): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return min === max ? n(min) : `${n(min)}–${n(max)}`;
}

function signature(sender: string | undefined, company: string | undefined, sep: string): string {
  const parts = [sender?.trim(), company?.trim()].filter(Boolean);
  return parts.length ? `— ${parts.join(sep)}` : '';
}

/** How aggressively a rendering pass trims its inputs to fit the ceiling. */
interface Budget {
  summarySentences: number;
  capabilities: number;
  /** Whether the client's stated timeline rides along on the effort line. */
  timeline: boolean;
}

/**
 * The reduction ladder, most generous first. Composing a *shorter message* is not
 * the same thing as truncating one: each rung is a complete, sendable message that
 * simply says less. What never falls off any rung is the link, the price the owner
 * asked for, and the closing question — those are the message's job.
 */
const BUDGETS: readonly Budget[] = [
  { summarySentences: 2, capabilities: 5, timeline: true },
  { summarySentences: 1, capabilities: 4, timeline: true },
  { summarySentences: 1, capabilities: 3, timeline: false },
  { summarySentences: 1, capabilities: 0, timeline: false },
  { summarySentences: 0, capabilities: 0, timeline: false },
];

/**
 * Assemble a sendable message from the scoping facts — no LLM.
 *
 * This is a real path, not a placeholder: it runs offline, in mock mode, and every
 * time a model call fails, and its output must be something the owner could
 * actually paste. It follows the same structure the prompt asks for (hook → what
 * we understood → the link → effort → price → a closing question) and walks the
 * budget ladder until it fits the channel's ceiling.
 *
 * If even the shortest rung is over, it returns that rung anyway and the caller
 * flags it — the same "warn, never cut" rule the LLM path follows.
 */
export function buildFallbackProposal(input: ProposalInput): string {
  const ceiling = PROPOSAL_CEILINGS[input.channel];
  let last = '';
  for (const budget of BUDGETS) {
    last = render(input, budget);
    if (proposalCharCount(last) <= ceiling) return last;
  }
  return last;
}

function render(input: ProposalInput, budget: Budget): string {
  const c = COPY[input.locale];
  const { facts } = input;
  const title = facts.title?.trim() || facts.idea?.trim() || '';

  const summary = firstSentences(
    facts.executiveSummary || facts.mvpStatement || facts.idea,
    budget.summarySentences,
  );
  const caps = facts.capabilities.slice(0, budget.capabilities);
  const timeline = budget.timeline ? facts.timeline?.trim() : undefined;

  // The hook is the owner's own line when they gave one — they know the posting,
  // and a line they wrote can't be a claim we invented.
  const hook = input.customHook?.trim() || pick(c.hooks, input.variant)(title);

  const effortLine =
    facts.effortWeeksMin !== undefined && facts.effortWeeksMax !== undefined
      ? c.effort(facts.effortWeeksMin, facts.effortWeeksMax, timeline)
      : timeline
        ? c.timelineOnly(timeline)
        : '';

  return paragraphs([
    c.greeting(input.clientName?.trim()),
    hook,
    summary && c.understood(summary),
    caps.length > 0 && c.scope(caps),
    c.link(facts.shareUrl),
    effortLine,
    // Present only when the owner opted in — `price` is absent otherwise, so
    // there is no branch here that could reach a figure it wasn't handed.
    input.price?.trim() && c.price(input.price.trim()),
    pick(c.closings, input.variant),
    c.signoff(input.senderName, input.companyName),
  ]);
}
