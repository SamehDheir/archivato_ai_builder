import type {
  CreateKbArticleInput,
  KbArticle,
  UpdateKbArticleInput,
} from '@archivato/shared';

/** DI token for the Knowledge Base store. */
export const KB_REPOSITORY = Symbol('KB_REPOSITORY');

/** Persistence seam for KB articles (Repository pattern). */
export interface KbRepository {
  /** Create an article. A stable `id` may be supplied (seeding); else generated. */
  create(input: CreateKbArticleInput, id?: string): Promise<KbArticle>;
  update(id: string, patch: UpdateKbArticleInput): Promise<KbArticle | null>;
  delete(id: string): Promise<boolean>;
  findById(id: string): Promise<KbArticle | null>;
  /** All articles (admin) or only published ones (public/AI), newest first. */
  list(opts?: { includeDrafts?: boolean }): Promise<KbArticle[]>;
  count(): Promise<number>;
}
