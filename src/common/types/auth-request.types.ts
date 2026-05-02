/**
 * Shape attached to `req.user` by JwtRefreshStrategy.
 * Lets controllers consume the validated session info in a type-safe way.
 */
export interface RefreshRequestUser {
  userId: string;
  sessionId: string;
}
