import { db } from "../prisma/db.ts";

// ─── Read ────────────────────────────────────────────────────────────────────

export async function findRefreshToken(id: number) {
  return db.orm.public.RefreshToken.where({ id }).first();
}

export async function findRefreshTokenByHash(tokenHash: string) {
  return db.orm.public.RefreshToken.where({ tokenHash }).first();
}

export async function findRefreshTokensByUser(userId: number) {
  return db.orm.public.RefreshToken.where({ userId }).all();
}

export async function findRefreshTokensBySession(sessionId: number) {
  return db.orm.public.RefreshToken.where({ sessionId }).all();
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createRefreshToken(
  userId: number,
  sessionId: number,
  tokenHash: string,
  expiresAt: Date,
) {
  return db.orm.public.RefreshToken.create({
    userId,
    sessionId,
    tokenHash,
    expiresAt,
    createdAt: new Date(),
  });
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

export async function revokeRefreshToken(id: number) {
  return db.orm.public.RefreshToken.where({ id }).update({ revokedAt: new Date() });
}

export async function revokeRefreshTokenByHash(tokenHash: string) {
  return db.orm.public.RefreshToken.where({ tokenHash }).update({ revokedAt: new Date() });
}

export async function revokeAllUserRefreshTokens(userId: number) {
  return db.orm.public.RefreshToken.where({ userId, revokedAt: null }).update({ revokedAt: new Date() });
}

export async function revokeAllSessionRefreshTokens(sessionId: number) {
  return db.orm.public.RefreshToken.where({ sessionId, revokedAt: null }).update({ revokedAt: new Date() });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteRefreshToken(id: number) {
  return db.orm.public.RefreshToken.where({ id }).delete();
}

export async function deleteExpiredRefreshTokens(before: Date) {
  return db.orm.public.RefreshToken.where({ expiresAt: before }).delete();
}
