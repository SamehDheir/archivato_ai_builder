/**
 * Knowledge Base — the Support Center's help-article store. Real, editable
 * content (repository-backed, CRUD by staff with `support:kb:manage`); it also
 * powers the AI Support Assistant's pre-ticket deflection. Runtime-free: the
 * scoring below is a pure function shared by the API (deflection + public
 * search) so it stays deterministic and unit-testable.
 */

import type { KbArticleRef, SupportCategory } from './support';

export interface KbArticle {
  id: string;
  title: string;
  body: string;
  category: SupportCategory;
  /** Search keywords the deflection layer matches against. */
  keywords: string[];
  /** Drafts are hidden from customers AND excluded from AI deflection. */
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A public-facing article card (no keywords/draft internals). */
export interface KbPublicArticle {
  id: string;
  title: string;
  category: SupportCategory;
  excerpt: string;
}

/** Full public article (detail page) — published only. */
export interface KbPublicArticleDetail extends KbPublicArticle {
  body: string;
  updatedAt: string;
}

/** Admin listing row — includes draft state + timestamps. */
export interface KbArticleSummary extends KbPublicArticle {
  published: boolean;
  updatedAt: string;
}

export interface CreateKbArticleInput {
  title: string;
  body: string;
  category: SupportCategory;
  keywords: string[];
  published: boolean;
}

export type UpdateKbArticleInput = Partial<CreateKbArticleInput>;

/** A short, single-line excerpt of an article body. */
export function excerptOf(body: string, max = 180): string {
  const b = (body ?? '').replace(/\s+/g, ' ').trim();
  return b.length > max ? `${b.slice(0, max - 1)}…` : b;
}

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

/**
 * Keyword search over a set of articles. Scores each by how many of its
 * keywords/title tokens appear in the query; returns the top matches as light
 * `KbArticleRef`s (id + title + excerpt) for the AI + the UI. Pure — the caller
 * decides which articles to pass (e.g. only published ones for deflection).
 */
export function searchArticles(
  articles: readonly KbArticle[],
  query: string,
  limit = 3,
): KbArticleRef[] {
  const q = ` ${query.toLowerCase()} `;
  const qTokens = new Set(tokenize(query));

  return articles
    .map((a) => {
      let score = 0;
      for (const kw of a.keywords) {
        const k = kw.toLowerCase();
        if (q.includes(` ${k} `) || q.includes(k)) score += 2;
      }
      for (const t of tokenize(a.title)) {
        if (qTokens.has(t)) score += 1;
      }
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(({ a }) => ({ id: a.id, title: a.title, excerpt: excerptOf(a.body) }));
}
