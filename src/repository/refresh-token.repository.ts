import { db } from "../prisma/db.ts";
import { toTemporal } from "../utils/temporalDate.ts";

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
    expiresAt: toTemporal(expiresAt),
    createdAt: toTemporal(new Date()),
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
    const nowMs = now.getTime();
    const temporalNow = toTemporal(now);
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
      (user.lockedUntil !== null && user.lockedUntil.epochMilliseconds <= nowMs) ||
      !session ||
      session.expiresAt.epochMilliseconds <= nowMs ||
      !oldToken ||
      oldToken.expiresAt.epochMilliseconds <= nowMs
    ) {
      throw new RefreshTokenRepositoryError();
    }

    const revokedToken = await tx.orm.public.RefreshToken
      .where({ id: refreshTokenId, userId, sessionId, revokedAt: null })
      .update({ revokedAt: temporalNow });
    if (!revokedToken) {
      throw new RefreshTokenRepositoryError();
    }

    await tx.orm.public.Session.where({ id: sessionId }).update({ lastActivityAt: temporalNow });
    const newToken = await tx.orm.public.RefreshToken.create({
      userId,
      sessionId,
      tokenHash: newTokenHash,
      expiresAt: toTemporal(expiresAt),
      createdAt: temporalNow,
    });
    return { user, session, refreshToken: newToken };
  });
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

export async function revokeRefreshToken(id: number) {
  return db.orm.public.RefreshToken.where({ id }).update({ revokedAt: toTemporal(new Date()) });
}

export async function revokeRefreshTokenByHash(tokenHash: string) {
  return db.orm.public.RefreshToken.where({ tokenHash })
    .update({ revokedAt: toTemporal(new Date()) });
}

export async function revokeAllUserRefreshTokens(userId: number) {
  return db.orm.public.RefreshToken.where({ userId, revokedAt: null })
    .update({ revokedAt: toTemporal(new Date()) });
}

export async function revokeAllSessionRefreshTokens(sessionId: number) {
  return db.orm.public.RefreshToken.where({ sessionId, revokedAt: null })
    .update({ revokedAt: toTemporal(new Date()) });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteRefreshToken(id: number) {
  return db.orm.public.RefreshToken.where({ id }).delete();
}

export async function deleteExpiredRefreshTokens(before: Date) {
  return db.orm.public.RefreshToken.where({ expiresAt: toTemporal(before) }).delete();
}
