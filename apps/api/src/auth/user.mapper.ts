import type { AuthUser } from '@archivato/shared';
import type { User } from './user.entity';

/** Strip the password hash and map a user to the client-safe shape. */
export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    providers: user.providers,
    createdAt: user.createdAt.toISOString(),
  };
}
