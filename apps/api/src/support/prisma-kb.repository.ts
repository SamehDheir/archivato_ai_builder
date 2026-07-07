import { Injectable } from '@nestjs/common';
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
    // Guard against updating a missing row (Prisma would throw).
    const exists = await this.prisma.kbArticle.findUnique({ where: { id } });
    if (!exists) return null;
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
