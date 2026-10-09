import { db } from "../prisma/db.ts";

// ─── Read ────────────────────────────────────────────────────────────────────

export async function findPasswordResetCode(id: number) {
  return db.orm.public.PasswordResetCode.where({ id }).first();
}

export async function findPasswordResetCodeByHash(userId: number, codeHash: string) {
  return db.orm.public.PasswordResetCode.where({ userId, codeHash }).first();
}

export async function findActivePasswordResetCodes(userId: number) {
  return db.orm.public.PasswordResetCode.where({ userId, usedAt: null }).all();
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createPasswordResetCode(userId: number, codeHash: string, expiresAt: Date) {
  return db.orm.public.PasswordResetCode.create({
    userId,
    codeHash,
    expiresAt,
    createdAt: new Date(),
  });
}

export async function replaceActivePasswordResetCode(
  userId: number,
  codeHash: string,
  expiresAt: Date,
) {
  return db.transaction(async (tx) => {
    await tx.orm.public.PasswordResetCode.where({ userId, usedAt: null })
      .update({ usedAt: new Date() });
    return tx.orm.public.PasswordResetCode.create({
      userId,
      codeHash,
      expiresAt,
      createdAt: new Date(),
    });
  });
}

// ─── Invalidate ───────────────────────────────────────────────────────────────

export async function invalidatePasswordResetCode(id: number) {
  return db.orm.public.PasswordResetCode.where({ id }).update({ usedAt: new Date() });
}

export async function invalidateAllPasswordResetCodes(userId: number) {
  return db.orm.public.PasswordResetCode.where({ userId, usedAt: null }).update({ usedAt: new Date() });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deletePasswordResetCode(id: number) {
  return db.orm.public.PasswordResetCode.where({ id }).delete();
}

export async function deleteExpiredPasswordResetCodes(before: Date) {
  return db.orm.public.PasswordResetCode.where({ expiresAt: before }).delete();
}
