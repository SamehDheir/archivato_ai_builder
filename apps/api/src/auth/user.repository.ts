import type { AuthProvider } from '@archivato/shared';
import type { User } from './user.entity';

/** DI token for the user store. */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/** Fields needed to create a user (id/timestamps are assigned by the store). */
export interface CreateUserInput {
  email: string;
  passwordHash: string | null;
  displayName: string;
  emailVerified?: boolean;
  providers?: AuthProvider[];
  /** Optional initial profile picture (e.g. captured from an OAuth provider). */
  avatarUrl?: string | null;
}

/**
 * Persistence seam for users (Repository pattern — project rule). In-memory
 * impl backs the unit tests; the Prisma impl backs the running app.
 */
export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<User>;
  /** Permanently delete a user; DB cascades remove their sessions + projects. */
  delete(id: string): Promise<void>;
}
