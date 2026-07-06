/** DI token for the GitHub-connection store. */
export const GITHUB_CONNECTION_REPOSITORY = Symbol('GITHUB_CONNECTION_REPOSITORY');

/** A stored GitHub connection. `tokenEncrypted` is AES-256-GCM ciphertext. */
export interface GithubConnectionRecord {
  id: string;
  userId: string;
  tokenEncrypted: string;
  githubLogin: string;
  scopes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertGithubConnectionInput {
  userId: string;
  tokenEncrypted: string;
  githubLogin: string;
  scopes: string;
}

/**
 * Persistence seam for GitHub connections (Repository pattern — project rule).
 * One connection per user (upsert by userId). The in-memory impl backs unit
 * tests; the Prisma impl backs the running app.
 */
export interface GithubConnectionRepository {
  findByUserId(userId: string): Promise<GithubConnectionRecord | null>;
  upsert(input: UpsertGithubConnectionInput): Promise<GithubConnectionRecord>;
  deleteByUserId(userId: string): Promise<void>;
}

/** In-memory implementation (unit tests / DB-free). */
export class InMemoryGithubConnectionRepository
  implements GithubConnectionRepository
{
  private readonly byUser = new Map<string, GithubConnectionRecord>();
  private seq = 0;

  async findByUserId(userId: string): Promise<GithubConnectionRecord | null> {
    return this.byUser.get(userId) ?? null;
  }

  async upsert(
    input: UpsertGithubConnectionInput,
  ): Promise<GithubConnectionRecord> {
    const existing = this.byUser.get(input.userId);
    const now = new Date();
    const record: GithubConnectionRecord = existing
      ? { ...existing, ...input, updatedAt: now }
      : {
          id: `gh_${++this.seq}`,
          createdAt: now,
          updatedAt: now,
          ...input,
        };
    this.byUser.set(input.userId, record);
    return record;
  }

  async deleteByUserId(userId: string): Promise<void> {
    this.byUser.delete(userId);
  }
}
