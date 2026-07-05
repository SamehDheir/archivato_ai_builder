import type { Permission } from './permissions';

/** Account access role. `admin` unlocks the superAdmin dashboard. */
export type AccountRole = 'user' | 'admin';

/** A user account as exposed to the client (never includes the password hash). */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** Whether the email has been verified (Slice 9b). */
  emailVerified: boolean;
  /**
   * Legacy coarse role, derived for back-compat: `admin` iff the user holds the
   * `super_admin` role. Prefer `permissions` for gating — see RBAC (permissions.ts).
   */
  role: AccountRole;
  /** Keys of the roles assigned to this user (RBAC). */
  roles: string[];
  /** Effective permissions — the union of all the user's roles' grants (RBAC). */
  permissions: Permission[];
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

/** Payload for PATCH /auth/profile — edits the signed-in user's profile. */
export interface UpdateProfileInput {
  displayName: string;
}

/**
 * Payload for POST /admin/users/provision — a super admin creates a staff
 * account (support / billing / admin) directly, without self-registration.
 * No password is supplied: the server generates a strong one and returns it
 * once. `roleIds` are the RBAC role ids to grant the new account.
 */
export interface ProvisionUserInput {
  email: string;
  displayName: string;
  roleIds: string[];
}

/**
 * Result of provisioning. `tempPassword` is the generated password in
 * plaintext, returned **once** so the admin can hand it off — it is never
 * retrievable again (only its hash is stored).
 */
export interface ProvisionedUser {
  user: AuthUser;
  tempPassword: string;
}

/**
 * Payload for POST /auth/change-password. `currentPassword` is required for
 * accounts that already have a password; OAuth-only accounts omit it to SET a
 * first password (which also enables local login).
 */
export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
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
