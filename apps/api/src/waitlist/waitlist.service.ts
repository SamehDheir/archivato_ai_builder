import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  WaitlistAdminPage,
  WaitlistEntryView,
  WaitlistSignupInput,
  WaitlistSignupResult,
} from '@archivato/shared';
import {
  WAITLIST_REPOSITORY,
  type WaitlistRepository,
} from './waitlist.repository';
import type { WaitlistEntry } from './waitlist.entity';

/** Largest page the admin list will return (caps abuse + CSV export size). */
const MAX_PAGE_SIZE = 200;

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

  async join(
    input: WaitlistSignupInput,
    country?: string | null,
  ): Promise<WaitlistSignupResult> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.repo.findByEmail(email);
    if (existing) return { ok: true, alreadyJoined: true };

    try {
      await this.repo.create({
        email,
        locale: input.locale?.slice(0, 12) ?? null,
        source: input.source?.slice(0, 64) ?? null,
        country: country ?? null,
      });
    } catch {
      // Unique-constraint race (concurrent double-submit): treat as already
      // joined rather than surfacing an error — the address is on the list.
      return { ok: true, alreadyJoined: true };
    }
    this.logger.log(`New waitlist signup (${email}).`);
    return { ok: true, alreadyJoined: false };
  }

  /** Total signups. */
  count(): Promise<number> {
    return this.repo.count();
  }

  /**
   * A newest-first, paginated page of signups for the admin console. `q` filters
   * by email/source (case-insensitive contains). Page/size are clamped so a
   * hand-crafted query can't request an unbounded page.
   */
  async list(page: number, pageSize: number, q?: string): Promise<WaitlistAdminPage> {
    const take = Math.min(Math.max(Math.trunc(pageSize) || 25, 1), MAX_PAGE_SIZE);
    const skip = Math.max(Math.trunc(page) || 1, 1) - 1;
    const { entries, total } = await this.repo.list({
      q: q?.trim() || undefined,
      skip: skip * take,
      take,
    });
    return { entries: entries.map(toView), total };
  }
}

/** Map a stored entry to its client-safe view (Date → ISO string). */
function toView(e: WaitlistEntry): WaitlistEntryView {
  return {
    id: e.id,
    email: e.email,
    locale: e.locale,
    source: e.source,
    country: e.country,
    createdAt: e.createdAt.toISOString(),
  };
}
