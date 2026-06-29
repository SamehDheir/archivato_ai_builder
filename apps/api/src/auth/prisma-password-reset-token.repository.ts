import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePasswordResetTokenInput,
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from './password-reset-token.repository';

/** PostgreSQL-backed password-reset-token store. */
@Injectable()
export class PrismaPasswordResetTokenRepository
  implements PasswordResetTokenRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreatePasswordResetTokenInput,
  ): Promise<PasswordResetTokenRecord> {
    const row = await this.prisma.passwordResetToken.create({
      data: {
        userId: input.userId,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
      },
    });
    return toEntity(row);
  }

  async findActiveByUserId(
    userId: string,
  ): Promise<PasswordResetTokenRecord | null> {
    const row = await this.prisma.passwordResetToken.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toEntity(row) : null;
  }

  async consume(id: string): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  async incrementAttempts(id: string): Promise<number> {
    const row = await this.prisma.passwordResetToken.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
    return row.attempts;
  }

  async consumeAllForUser(userId: string): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }
}

function toEntity(row: {
  id: string;
  userId: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}): PasswordResetTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    codeHash: row.codeHash,
    attempts: row.attempts,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  };
}
