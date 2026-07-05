import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { WaitlistEntry } from './waitlist.entity';
import type {
  CreateWaitlistEntryInput,
  WaitlistRepository,
} from './waitlist.repository';

/** PostgreSQL-backed waitlist store. */
@Injectable()
export class PrismaWaitlistRepository implements WaitlistRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<WaitlistEntry | null> {
    return this.prisma.waitlistEntry.findUnique({ where: { email } });
  }

  async create(input: CreateWaitlistEntryInput): Promise<WaitlistEntry> {
    return this.prisma.waitlistEntry.create({
      data: {
        email: input.email,
        locale: input.locale ?? null,
        source: input.source ?? null,
      },
    });
  }

  async count(): Promise<number> {
    return this.prisma.waitlistEntry.count();
  }
}
