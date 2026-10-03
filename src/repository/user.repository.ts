import { db } from "../prisma/db.ts";

// ─── Read ────────────────────────────────────────────────────────────────────

export async function findUser(id: number) {
  return db.orm.public.User.where({ id }).first();
}

export async function findUserByEmail(email: string) {
  return db.orm.public.User.where({ email }).first();
}

export async function findUserByUsername(username: string) {
  return db.orm.public.User.where({ username }).first();
}

export async function findUsers(limit = 10) {
  return db.orm.public.User.select("id", "email", "username", "createdAt")
    .limit(limit)
    .all();
}

// ─── Create / Update / Delete ────────────────────────────────────────────────

export async function createUser(
  email: string,
  username: string,
  passwordHash: string,
  role: "USER" | "ORGANIZER" | "ADMIN" = "USER",
  accountStatus: "ACTIVE" | "INACTIVE" | "SUSPENDED" = "ACTIVE",
  avatarUrl?: string,
) {
  return db.orm.public.User.create({
    email,
    username,
    passwordHash,
    role,
    accountStatus,
    avatarUrl: avatarUrl ?? null,
    createdAt: new Date(),
  });
}

export async function updateUser(
  id: number,
  updates: {
    email?: string;
    username?: string;
    role?: "USER" | "ORGANIZER" | "ADMIN";
    accountStatus?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
    avatarUrl?: string;
  },
) {
  return db.orm.public.User.where({ id }).update(updates);
}

// ─── Account status ──────────────────────────────────────────────────────────

export async function activateUser(id: number) {
  return db.orm.public.User.where({ id }).update({ accountStatus: "ACTIVE" });
}

export async function deactivateUser(id: number) {
  return db.orm.public.User.where({ id }).update({ accountStatus: "INACTIVE" });
}

export async function suspendUser(id: number) {
  return db.orm.public.User.where({ id }).update({ accountStatus: "SUSPENDED" });
}

export async function restoreUser(id: number) {
  return db.orm.public.User.where({ id }).update({ accountStatus: "ACTIVE" });
}

// ─── Credentials ─────────────────────────────────────────────────────────────

export async function updatePassword(id: number, passwordHash: string) {
  return db.orm.public.User.where({ id }).update({ passwordHash });
}

export async function updateEmail(id: number, email: string) {
  return db.orm.public.User.where({ id }).update({ email });
}

export async function updateUsername(id: number, username: string) {
  return db.orm.public.User.where({ id }).update({ username });
}

export async function updateAvatar(id: number, avatarUrl: string | null) {
  return db.orm.public.User.where({ id }).update({ avatarUrl });
}

// ─── Login tracking ──────────────────────────────────────────────────────────

export async function recordLogin(id: number) {
  return db.orm.public.User.where({ id }).update({
    lastLoginAt: new Date(),
    failedLoginAttempts: 0,
  });
}

export async function recordFailedLogin(id: number, attempts: number) {
  return db.orm.public.User.where({ id }).update({ failedLoginAttempts: attempts });
}

export async function resetLoginAttempts(id: number) {
  return db.orm.public.User.where({ id }).update({ failedLoginAttempts: 0 });
}

export async function lockUser(id: number, lockedUntil: Date) {
  return db.orm.public.User.where({ id }).update({ lockedUntil });
}

export async function unlockUser(id: number) {
  return db.orm.public.User.where({ id }).update({ lockedUntil: null, failedLoginAttempts: 0 });
}

// ─── Connection ───────────────────────────────────────────────────────────────

export async function setConnectionStatus(id: number, connectionStatus: "ONLINE" | "OFFLINE") {
  return db.orm.public.User.where({ id }).update({ connectionStatus });
}

// ─── Soft delete ─────────────────────────────────────────────────────────────

export async function markUserForDeletion(id: number) {
  return db.orm.public.User.where({ id }).update({ deletedAt: new Date() });
}

export async function restoreDeletedUser(id: number) {
  return db.orm.public.User.where({ id }).update({ deletedAt: null });
}

export async function permanentlyDeleteUser(id: number) {
  return db.orm.public.User.where({ id }).delete();
}
