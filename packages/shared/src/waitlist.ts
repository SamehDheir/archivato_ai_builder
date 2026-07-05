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
