/** Payload for the public `POST /waitlist` signup. */
export interface WaitlistSignupInput {
  email: string;
  /** Optional UI locale at signup time (for later, localized outreach). */
  locale?: string;
  /** Optional source/campaign tag (e.g. the section that converted). */
  source?: string;
}

/**
 * Result of a waitlist signup. Always `ok` on a valid email — `alreadyJoined`
 * distinguishes a fresh signup from a duplicate so the UI can tailor the
 * message without leaking whether an email was previously entered to attackers
 * (both are success states).
 */
export interface WaitlistSignupResult {
  ok: true;
  alreadyJoined: boolean;
}

/** A waitlist signup as exposed to the admin console (client-safe view). */
export interface WaitlistEntryView {
  id: string;
  email: string;
  locale: string | null;
  source: string | null;
  /** ISO-3166-1 alpha-2 country derived from the signup request, or null. */
  country: string | null;
  /** ISO timestamp of signup. */
  createdAt: string;
}

/**
 * One page of waitlist signups for the admin list. `total` is the count matching
 * the current `q` filter (drives pagination + the displayed count), newest first.
 */
export interface WaitlistAdminPage {
  entries: WaitlistEntryView[];
  total: number;
}
