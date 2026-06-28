/**
 * Authentication domain types (Slice 9) — shared between the NestJS API
 * (apps/api) and the Next.js client (apps/web).
 *
 * Tokens are delivered as httpOnly cookies, so the client never handles raw
 * JWTs; these types describe only the public-safe user shape and the request
 * payloads. Keep this file runtime-free.
 */

/** A user account as exposed to the client (never includes the password hash). */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** Whether the email has been verified (Slice 9b). */
  emailVerified: boolean;
  /** Linked OAuth providers, if any (Slice 9c). */
  providers: AuthProvider[];
  createdAt: string;
}

/** External identity providers we support (Slice 9c). `password` = local login. */
export type AuthProvider = 'password' | 'google' | 'github';

/** Payload for POST /auth/register. */
export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

/** Payload for POST /auth/login. */
export interface LoginInput {
  email: string;
  password: string;
}
