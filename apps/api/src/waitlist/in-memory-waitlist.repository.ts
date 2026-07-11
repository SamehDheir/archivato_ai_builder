import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { WaitlistEntry } from './waitlist.entity';
import type {
  CreateWaitlistEntryInput,
  ListWaitlistParams,
  WaitlistRepository,
} from './waitlist.repository';

/** In-memory waitlist store — used by unit tests (keeps them DB-free). */
@Injectable()
export class InMemoryWaitlistRepository implements WaitlistRepository {
  private readonly entries = new Map<string, WaitlistEntry>();

  async findByEmail(email: string): Promise<WaitlistEntry | null> {
    return this.entries.get(email) ?? null;
  }

  async create(input: CreateWaitlistEntryInput): Promise<WaitlistEntry> {
    const entry: WaitlistEntry = {
      id: randomUUID(),
      email: input.email,
      locale: input.locale ?? null,
      source: input.source ?? null,
      country: input.country ?? null,
      createdAt: new Date(),
    };
    this.entries.set(entry.email, entry);
    return entry;
  }

  async count(): Promise<number> {
    return this.entries.size;
  }

  async list({
    q,
    skip,
    take,
  }: ListWaitlistParams): Promise<{ entries: WaitlistEntry[]; total: number }> {
    let all = [...this.entries.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    if (q) {
      // Case-insensitive on BOTH columns, matching the Prisma impl's
      // `mode: 'insensitive'`. Lowercasing the needle alone would leave the two
      // impls disagreeing on any email not already normalized on write.
      const needle = q.toLowerCase();
      all = all.filter(
        (e) =>
          e.email.toLowerCase().includes(needle) ||
          (e.source ?? '').toLowerCase().includes(needle),
      );
    }
    return { entries: all.slice(skip, skip + take), total: all.length };
  }
}
