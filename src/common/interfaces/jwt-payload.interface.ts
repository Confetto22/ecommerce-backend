import type { Role } from 'generated/prisma/enums';

/**
 * Access token payload. Role is embedded so role-based guards can authorize
 * without an extra DB lookup. JwtStrategy still re-fetches the user, so a
 * role change requires a refresh to take effect.
 */
export interface JwtAccessPayload {
  sub: string;
  role: Role;
}

/**
 * Refresh token payload. `tokenId` references a Session row; the session row
 * holds the SHA-256 of this exact JWT, which is how rotation + reuse
 * detection are enforced.
 */
export interface JwtRefreshPayload {
  sub: string;
  tokenId: string;
}
