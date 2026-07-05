import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  WaitlistSignupInput,
  WaitlistSignupResult,
} from '@archivato/shared';
import {
  WAITLIST_REPOSITORY,
  type WaitlistRepository,
} from './waitlist.repository';

/**
 * Waitlist domain logic. Signup is **idempotent**: a repeat email is a no-op
 * that still returns success (`alreadyJoined: true`), so the public endpoint
 * never leaks whether an address was previously entered. Emails are normalized
 * (trim + lowercase) before storage/lookup so casing/whitespace can't create
 * duplicates.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    @Inject(WAITLIST_REPOSITORY) private readonly repo: WaitlistRepository,
  ) {}

  async join(input: WaitlistSignupInput): Promise<WaitlistSignupResult> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.repo.findByEmail(email);
    if (existing) return { ok: true, alreadyJoined: true };

    try {
      await this.repo.create({
        email,
        locale: input.locale?.slice(0, 12) ?? null,
        source: input.source?.slice(0, 64) ?? null,
      });
    } catch {
      // Unique-constraint race (concurrent double-submit): treat as already
      // joined rather than surfacing an error — the address is on the list.
      return { ok: true, alreadyJoined: true };
    }
    this.logger.log(`New waitlist signup (${email}).`);
    return { ok: true, alreadyJoined: false };
  }

  /** Total signups (for a future admin view). */
  count(): Promise<number> {
    return this.repo.count();
  }
}
