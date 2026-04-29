export interface JwtPayload {
  sub: string; // User ID
  role: string;
}

export interface JwtRefreshPayload {
  sub: string; // User ID
  tokenId: string; // Session ID
}
