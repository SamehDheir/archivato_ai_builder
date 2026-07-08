import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { User } from './user.entity';
import type {
  CreateUserInput,
  UserRepository,
} from './user.repository';

/** In-memory user store — used by unit tests (keeps them DB-free). */
@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const user: User = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      emailVerified: input.emailVerified ?? false,
      role: 'user',
      providers: input.providers ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async findById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const target = email.toLowerCase();
    for (const user of this.users.values()) {
      if (user.email === target) return { ...user };
    }
    return null;
  }

  async save(user: User): Promise<User> {
    const next: User = { ...user, updatedAt: new Date() };
    this.users.set(next.id, next);
    return { ...next };
  }

  async delete(id: string): Promise<void> {
    this.users.delete(id);
  }
}
