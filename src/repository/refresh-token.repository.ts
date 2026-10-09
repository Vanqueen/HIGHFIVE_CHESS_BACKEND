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

export async function findActiveRefreshTokensByUser(userId: number) {
  return db.orm.public.RefreshToken.where({ userId, revokedAt: null }).all();
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

export class RefreshTokenRepositoryError extends Error {
  readonly statusCode = 401;

  constructor() {
    super("Refresh token invalide, expiré ou révoqué.");
    this.name = "RefreshTokenRepositoryError";
  }
}

export async function rotateRefreshToken(
  refreshTokenId: number,
  userId: number,
  sessionId: number,
  newTokenHash: string,
  expiresAt: Date,
) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const user = await tx.orm.public.User.where({ id: userId }).first();
    const session = await tx.orm.public.Session
      .where({ id: sessionId, userId, revokedAt: null })
      .first();
    const oldToken = await tx.orm.public.RefreshToken
      .where({ id: refreshTokenId, userId, sessionId, revokedAt: null })
      .first();

    if (
      !user ||
      user.deletedAt !== null ||
      user.accountStatus !== "ACTIVE" ||
      (user.lockedUntil !== null && user.lockedUntil > now) ||
      !session ||
      session.expiresAt <= now ||
      !oldToken ||
      oldToken.expiresAt <= now
    ) {
      throw new RefreshTokenRepositoryError();
    }

    const revokedToken = await tx.orm.public.RefreshToken
      .where({ id: refreshTokenId, userId, sessionId, revokedAt: null })
      .update({ revokedAt: now });
    if (!revokedToken) {
      throw new RefreshTokenRepositoryError();
    }

    await tx.orm.public.Session.where({ id: sessionId }).update({ lastActivityAt: now });
    const newToken = await tx.orm.public.RefreshToken.create({
      userId,
      sessionId,
      tokenHash: newTokenHash,
      expiresAt,
      createdAt: now,
    });
    return { user, session, refreshToken: newToken };
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
