import { db } from "../prisma/db.ts";
import { toTemporal } from "../utils/temporalDate.ts";

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

export async function searchActiveUsers(username: string, limit = 10) {
  return db.orm.public.User
    .select("id", "username", "avatarUrl")
    .where({ accountStatus: "ACTIVE", deletedAt: null })
    .where((user) => user.username.ilike(`%${username}%`))
    .orderBy((user) => user.username.asc())
    .limit(limit)
    .all();
}

export async function findUsers(limit = 10) {
  return db.orm.public.User.select(
    "id",
    "email",
    "username",
    "avatarUrl",
    "role",
    "accountStatus",
    "connectionStatus",
    "lastLoginAt",
    "createdAt",
    "updatedAt",
  )
    .where({ deletedAt: null })
    .orderBy((user) => user.createdAt.desc())
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

export async function savePendingEmailChange(
  id: number,
  email: string,
  codeHash: string,
  expiresAt: Date,
) {
  return db.orm.public.User.where({ id }).update({
    pendingEmail: email,
    emailChangeCodeHash: codeHash,
    emailChangeExpiresAt: toTemporal(expiresAt),
  });
}

export async function completePendingEmailChange(
  id: number,
  email: string,
  codeHash: string,
  expiresAt: Date,
) {
  return db.transaction(async (tx) => {
    const updated = await tx.orm.public.User
      .where({
        id,
        deletedAt: null,
        pendingEmail: email,
        emailChangeCodeHash: codeHash,
        emailChangeExpiresAt: toTemporal(expiresAt),
      })
      .update({
        email,
        pendingEmail: null,
        emailChangeCodeHash: null,
        emailChangeExpiresAt: null,
        connectionStatus: "OFFLINE",
      });

    if (!updated) return false;

    const now = new Date();
    await tx.orm.public.Session.where({ userId: id, revokedAt: null })
      .update({ revokedAt: toTemporal(now) });
    await tx.orm.public.RefreshToken.where({ userId: id, revokedAt: null })
      .update({ revokedAt: toTemporal(now) });
    return true;
  });
}

export async function clearPendingEmailChange(id: number, codeHash: string) {
  return db.orm.public.User.where({ id, emailChangeCodeHash: codeHash }).update({
    pendingEmail: null,
    emailChangeCodeHash: null,
    emailChangeExpiresAt: null,
  });
}

export async function updateUsername(id: number, username: string) {
  return db.orm.public.User.where({ id }).update({ username });
}

export async function updateAvatar(
  id: number,
  avatarUrl: string | null,
  avatarPublicId: string | null,
) {
  return db.orm.public.User.where({ id }).update({ avatarUrl, avatarPublicId });
}

// ─── Login tracking ──────────────────────────────────────────────────────────

export async function recordLogin(id: number) {
  return db.orm.public.User.where({ id }).update({
    lastLoginAt: toTemporal(new Date()),
    failedLoginAttempts: 0,
  });
}

export async function recordFailedLogin(id: number, maxAttempts: number, lockedUntil: Date) {
  const plan = db.raw.sql`
    UPDATE "public"."User"
    SET
      "failedLoginAttempts" = CASE
        WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= NOW() THEN 1
        ELSE "failedLoginAttempts" + 1
      END,
      "lockedUntil" = CASE
        WHEN CASE
          WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= NOW() THEN 1
          ELSE "failedLoginAttempts" + 1
        END >= ${maxAttempts}
          THEN GREATEST(COALESCE("lockedUntil", NOW()), ${lockedUntil.toISOString()}::timestamptz)
        WHEN "lockedUntil" IS NOT NULL AND "lockedUntil" <= NOW() THEN NULL
        ELSE "lockedUntil"
      END
    WHERE "id" = ${id}
  `.affectedCount().build();
  return db.runtime().execute(plan);
}

export async function resetLoginAttempts(id: number) {
  return db.orm.public.User.where({ id }).update({ failedLoginAttempts: 0 });
}

export async function lockUser(id: number, lockedUntil: Date) {
  return db.orm.public.User.where({ id }).update({ lockedUntil: toTemporal(lockedUntil) });
}

export async function unlockUser(id: number) {
  return db.orm.public.User.where({ id }).update({ lockedUntil: null, failedLoginAttempts: 0 });
}

// ─── Connection ───────────────────────────────────────────────────────────────

export async function setConnectionStatus(id: number, connectionStatus: "ONLINE" | "OFFLINE") {
  const updated = await db.orm.public.User
    .where({
      id,
      ...(connectionStatus === "ONLINE"
        ? { deletedAt: null, accountStatus: "ACTIVE" as const }
        : {}),
    })
    .update({ connectionStatus });
  return Boolean(updated);
}

// ─── Soft delete ─────────────────────────────────────────────────────────────

export async function markUserForDeletion(id: number) {
  return db.orm.public.User.where({ id }).update({ deletedAt: toTemporal(new Date()) });
}

export async function restoreDeletedUser(id: number) {
  return db.orm.public.User.where({ id }).update({ deletedAt: null });
}

export async function permanentlyDeleteUser(id: number) {
  return db.orm.public.User.where({ id }).delete();
}
