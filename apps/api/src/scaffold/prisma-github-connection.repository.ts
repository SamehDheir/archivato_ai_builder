import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  GithubConnectionRecord,
  GithubConnectionRepository,
  UpsertGithubConnectionInput,
} from './github-connection.repository';

/** Prisma-backed GitHub-connection store (the running app). */
@Injectable()
export class PrismaGithubConnectionRepository
  implements GithubConnectionRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<GithubConnectionRecord | null> {
    return this.prisma.githubConnection.findUnique({ where: { userId } });
  }

  async upsert(
    input: UpsertGithubConnectionInput,
  ): Promise<GithubConnectionRecord> {
    return this.prisma.githubConnection.upsert({
      where: { userId: input.userId },
      create: input,
      update: {
        tokenEncrypted: input.tokenEncrypted,
        githubLogin: input.githubLogin,
        scopes: input.scopes,
      },
    });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.githubConnection.deleteMany({ where: { userId } });
  }
}
