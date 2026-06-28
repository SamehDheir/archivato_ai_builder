import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateEmailVerificationTokenInput,
  EmailVerificationTokenRecord,
  EmailVerificationTokenRepository,
} from './email-verification-token.repository';

/** PostgreSQL-backed email-verification-token store. */
@Injectable()
export class PrismaEmailVerificationTokenRepository
  implements EmailVerificationTokenRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateEmailVerificationTokenInput,
  ): Promise<EmailVerificationTokenRecord> {
    const row = await this.prisma.emailVerificationToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
    return toEntity(row);
  }

  async findByHash(
    tokenHash: string,
  ): Promise<EmailVerificationTokenRecord | null> {
    const row = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    return row ? toEntity(row) : null;
  }

  async consume(id: string): Promise<void> {
    await this.prisma.emailVerificationToken.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  async consumeAllForUser(userId: string): Promise<void> {
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }
}

function toEntity(row: {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}): EmailVerificationTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  };
}
