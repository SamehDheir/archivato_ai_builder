import { Injectable } from '@nestjs/common';
import type { AccountRole, AuthProvider } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from './user.entity';
import type {
  CreateUserInput,
  UserRepository,
} from './user.repository';

/** PostgreSQL-backed user store. */
@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl ?? null,
        emailVerified: input.emailVerified ?? false,
        providers: input.providers ?? [],
      },
    });
    return toEntity(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    return row ? toEntity(row) : null;
  }

  async save(user: User): Promise<User> {
    const row = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.email.toLowerCase(),
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        role: user.role,
        providers: user.providers,
      },
    });
    return toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }
}

function toEntity(row: {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  role: string;
  providers: string[];
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    emailVerified: row.emailVerified,
    role: row.role as AccountRole,
    providers: row.providers as AuthProvider[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
