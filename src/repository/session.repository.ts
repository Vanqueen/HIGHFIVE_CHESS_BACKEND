import { db } from "../prisma/db.ts";

// ─── Read ────────────────────────────────────────────────────────────────────

export async function findSession(id: number) {
  return db.orm.public.Session.where({ id }).first();
}

export async function findSessionsByUser(userId: number) {
  return db.orm.public.Session.where({ userId }).all();
}

export async function findActiveSessionsByUser(userId: number) {
  return db.orm.public.Session.where({ userId, revokedAt: null }).all();
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createSession(userId: number, expiresAt: Date) {
  return db.orm.public.Session.create({
    userId,
    expiresAt,
    createdAt: new Date(),
    lastActivityAt: new Date(),
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function touchSession(id: number) {
  return db.orm.public.Session.where({ id }).update({ lastActivityAt: new Date() });
}

export async function revokeSession(id: number) {
  return db.orm.public.Session.where({ id }).update({ revokedAt: new Date() });
}

export async function revokeAllUserSessions(userId: number) {
  return db.orm.public.Session.where({ userId, revokedAt: null }).update({ revokedAt: new Date() });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteSession(id: number) {
  return db.orm.public.Session.where({ id }).delete();
}

export async function deleteExpiredSessions(before: Date) {
  return db.orm.public.Session.where({ expiresAt: before }).delete();
}
