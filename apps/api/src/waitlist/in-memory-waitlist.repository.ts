import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { WaitlistEntry } from './waitlist.entity';
import type {
  CreateWaitlistEntryInput,
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
      createdAt: new Date(),
    };
    this.entries.set(entry.email, entry);
    return entry;
  }

  async count(): Promise<number> {
    return this.entries.size;
  }
}
