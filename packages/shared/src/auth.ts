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
  /**
   * Client-computed browser fingerprint used to enforce **one account per
   * device** (anti-spam). Only a hash is ever stored server-side. Optional at
   * the type level so the service and OAuth path stay usable without it; the
   * HTTP DTO requires it, so real browser registrations always carry one.
   */
  fingerprint?: string;
}

/** Payload for POST /auth/login. */
export interface LoginInput {
  email: string;
  password: string;
}

/** Payload for POST /auth/forgot-password — emails a one-time reset code. */
export interface ForgotPasswordInput {
  email: string;
}

/** Payload for POST /auth/reset-password — the emailed OTP + a new password. */
export interface ResetPasswordInput {
  email: string;
  /** The 6-digit one-time code from the email. */
  code: string;
  newPassword: string;
}
