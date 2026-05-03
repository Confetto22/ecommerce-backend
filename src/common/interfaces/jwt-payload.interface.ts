import type { Role } from 'generated/prisma/enums';

/**
 * Access token payload. Role is embedded for logging/debugging; JwtStrategy
 * re-fetches the user so `request.user` reflects the DB (including role changes).
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
