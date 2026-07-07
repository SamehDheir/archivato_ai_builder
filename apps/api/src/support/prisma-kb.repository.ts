import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { KbArticle as PrismaKbArticle } from '@prisma/client';
import type {
  CreateKbArticleInput,
  KbArticle,
  SupportCategory,
  UpdateKbArticleInput,
} from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { KbRepository } from './kb.repository';

/** PostgreSQL-backed Knowledge Base store. */
@Injectable()
export class PrismaKbRepository implements KbRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateKbArticleInput, id?: string): Promise<KbArticle> {
    const row = await this.prisma.kbArticle.create({
      data: {
        ...(id ? { id } : {}),
        title: input.title,
        body: input.body,
        category: input.category,
        keywords: input.keywords,
        published: input.published,
      },
    });
    return this.toDomain(row);
  }

  async update(id: string, patch: UpdateKbArticleInput): Promise<KbArticle | null> {
    // Update directly (atomic); a missing row (incl. a concurrent delete) yields
    // Prisma's P2025 — map it to `null` so the service returns a clean 404
    // instead of a 500. `undefined` fields are ignored by Prisma (partial patch).
    try {
      const row = await this.prisma.kbArticle.update({
        where: { id },
        data: {
          title: patch.title,
          body: patch.body,
          category: patch.category,
          keywords: patch.keywords,
          published: patch.published,
        },
      });
      return this.toDomain(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        return null;
      }
      throw err;
    }
  }

  async delete(id: string): Promise<boolean> {
    const { count } = await this.prisma.kbArticle.deleteMany({ where: { id } });
    return count > 0;
  }

  async findById(id: string): Promise<KbArticle | null> {
    const row = await this.prisma.kbArticle.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async list(opts?: { includeDrafts?: boolean }): Promise<KbArticle[]> {
    const rows = await this.prisma.kbArticle.findMany({
      where: opts?.includeDrafts ? undefined : { published: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async count(): Promise<number> {
    return this.prisma.kbArticle.count();
  }

  private toDomain(row: PrismaKbArticle): KbArticle {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      category: row.category as SupportCategory,
      keywords: row.keywords,
      published: row.published,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
