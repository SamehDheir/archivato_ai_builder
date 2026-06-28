/** Cookie names for the auth tokens (both httpOnly). */
export const ACCESS_TOKEN_COOKIE = 'archivato_access';
export const REFRESH_TOKEN_COOKIE = 'archivato_refresh';

/** Shape of the signed access-token JWT payload. */
export interface JwtPayload {
  /** User id. */
  sub: string;
  email: string;
}
