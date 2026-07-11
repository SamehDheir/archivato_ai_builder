import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { WaitlistEntry } from './waitlist.entity';
import type {
  CreateWaitlistEntryInput,
  ListWaitlistParams,
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
        country: input.country ?? null,
      },
    });
  }

  async count(): Promise<number> {
    return this.prisma.waitlistEntry.count();
  }

  async list({
    q,
    skip,
    take,
  }: ListWaitlistParams): Promise<{ entries: WaitlistEntry[]; total: number }> {
    const where = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { source: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [entries, total] = await this.prisma.$transaction([
      this.prisma.waitlistEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.waitlistEntry.count({ where }),
    ]);
    return { entries, total };
  }
}
