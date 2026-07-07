import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  excerptOf,
  searchArticles,
  type CreateKbArticleInput,
  type KbArticle,
  type KbArticleRef,
  type KbArticleSummary,
  type KbPublicArticle,
  type KbPublicArticleDetail,
  type UpdateKbArticleInput,
} from '@archivato/shared';
import { KB_REPOSITORY, type KbRepository } from './kb.repository';
import { KB_SEED } from './support-knowledge-base';

/**
 * Knowledge Base domain logic. Seeds the curated articles on first boot (so the
 * AI deflection layer + public KB work out of the box), then serves:
 *   • public reads (published only) for customers,
 *   • deflection search (published only) for the AI assistant,
 *   • full CRUD for staff holding `support:kb:manage`.
 */
@Injectable()
export class KbService implements OnModuleInit {
  private readonly logger = new Logger(KbService.name);

  constructor(@Inject(KB_REPOSITORY) private readonly repo: KbRepository) {}

  /** Seed the curated set once, only when the store is empty (idempotent). */
  async onModuleInit(): Promise<void> {
    try {
      if ((await this.repo.count()) > 0) return;
      for (const seed of KB_SEED) {
        await this.repo.create({ ...seed, published: true }, seed.id);
      }
      this.logger.log(`Seeded ${KB_SEED.length} Knowledge Base articles.`);
    } catch (err) {
      // Never block boot on seeding (e.g. DB not ready in some environments).
      this.logger.warn(`KB seeding skipped: ${err}`);
    }
  }

  // ── Public (customer) ─────────────────────────────────────────────────────

  /** Published articles as cards; when `q` is set, keyword-ranked. */
  async listPublic(q?: string): Promise<KbPublicArticle[]> {
    const published = await this.repo.list({ includeDrafts: false });
    if (q && q.trim()) {
      const ranked = searchArticles(published, q, published.length);
      const byId = new Map(published.map((a) => [a.id, a]));
      return ranked
        .map((r) => byId.get(r.id))
        .filter((a): a is KbArticle => !!a)
        .map((a) => this.toPublic(a));
    }
    return published.map((a) => this.toPublic(a));
  }

  /** One published article (full body). 404 for a draft or missing id. */
  async getPublic(id: string): Promise<KbPublicArticleDetail> {
    const a = await this.repo.findById(id);
    if (!a || !a.published) {
      throw new NotFoundException(`Article ${id} not found.`);
    }
    return {
      id: a.id,
      title: a.title,
      category: a.category,
      excerpt: excerptOf(a.body),
      body: a.body,
      updatedAt: a.updatedAt,
    };
  }

  /** Top published articles matching a query — for AI deflection. */
  async searchForDeflection(query: string, limit = 3): Promise<KbArticleRef[]> {
    const published = await this.repo.list({ includeDrafts: false });
    return searchArticles(published, query, limit);
  }

  // ── Admin (staff, support:kb:manage) ──────────────────────────────────────

  async adminList(): Promise<KbArticleSummary[]> {
    const all = await this.repo.list({ includeDrafts: true });
    return all.map((a) => ({
      ...this.toPublic(a),
      published: a.published,
      updatedAt: a.updatedAt,
    }));
  }

  async adminGet(id: string): Promise<KbArticle> {
    const a = await this.repo.findById(id);
    if (!a) throw new NotFoundException(`Article ${id} not found.`);
    return a;
  }

  create(input: CreateKbArticleInput): Promise<KbArticle> {
    return this.repo.create(input);
  }

  async update(id: string, patch: UpdateKbArticleInput): Promise<KbArticle> {
    const updated = await this.repo.update(id, patch);
    if (!updated) throw new NotFoundException(`Article ${id} not found.`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const ok = await this.repo.delete(id);
    if (!ok) throw new NotFoundException(`Article ${id} not found.`);
  }

  private toPublic(a: KbArticle): KbPublicArticle {
    return {
      id: a.id,
      title: a.title,
      category: a.category,
      excerpt: excerptOf(a.body),
    };
  }
}
