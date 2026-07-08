import type { AccountRole, AuthProvider } from '@archivato/shared';

/**
 * A persisted user account. `passwordHash` is null for accounts created purely
 * via OAuth (Slice 9c). Mapped onto the Prisma `users` table.
 */
export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  /**
   * Profile picture: a base64 `data:` URI (user upload, stored inline) or an
   * external URL from an OAuth provider. `null` when unset (UI shows initials).
   */
  avatarUrl: string | null;
  emailVerified: boolean;
  /** Access role — `admin` unlocks the superAdmin dashboard. */
  role: AccountRole;
  providers: AuthProvider[];
  createdAt: Date;
  updatedAt: Date;
}
