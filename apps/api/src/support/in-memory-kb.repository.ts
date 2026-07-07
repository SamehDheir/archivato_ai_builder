import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateKbArticleInput,
  KbArticle,
  UpdateKbArticleInput,
} from '@archivato/shared';
import type { KbRepository } from './kb.repository';

/** Process-local KB store used by unit tests. */
@Injectable()
export class InMemoryKbRepository implements KbRepository {
  private readonly articles = new Map<string, KbArticle>();

  async create(input: CreateKbArticleInput, id?: string): Promise<KbArticle> {
    const now = new Date().toISOString();
    const article: KbArticle = {
      id: id ?? randomUUID(),
      title: input.title,
      body: input.body,
      category: input.category,
      keywords: input.keywords,
      published: input.published,
      createdAt: now,
      updatedAt: now,
    };
    this.articles.set(article.id, article);
    return article;
  }

  async update(id: string, patch: UpdateKbArticleInput): Promise<KbArticle | null> {
    const existing = this.articles.get(id);
    if (!existing) return null;
    const updated: KbArticle = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.articles.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.articles.delete(id);
  }

  async findById(id: string): Promise<KbArticle | null> {
    return this.articles.get(id) ?? null;
  }

  async list(opts?: { includeDrafts?: boolean }): Promise<KbArticle[]> {
    const all = [...this.articles.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    return opts?.includeDrafts ? all : all.filter((a) => a.published);
  }

  async count(): Promise<number> {
    return this.articles.size;
  }
}
