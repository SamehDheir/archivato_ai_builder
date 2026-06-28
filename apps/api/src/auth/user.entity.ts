import type { AuthProvider } from '@archivato/shared';

/**
 * A persisted user account. `passwordHash` is null for accounts created purely
 * via OAuth (Slice 9c). Mapped onto the Prisma `users` table.
 */
export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  emailVerified: boolean;
  providers: AuthProvider[];
  createdAt: Date;
  updatedAt: Date;
}
