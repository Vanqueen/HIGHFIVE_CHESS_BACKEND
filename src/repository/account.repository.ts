import { db } from "../prisma/db.ts";

export class AccountRepositoryError extends Error {
  readonly statusCode: number;

  constructor(
    message: string,
    readonly reason: "not_found" | "deleted" | "inactive" | "suspended" | "locked" | "credentials_changed" | "invalid_reset_code",
  ) {
    super(message);
    this.name = "AccountRepositoryError";
    this.statusCode = {
      not_found: 404,
      deleted: 401,
      inactive: 401,
      suspended: 401,
      locked: 423,
      credentials_changed: 401,
      invalid_reset_code: 400,
    }[reason];
  }
}

export async function createAuthenticatedSession(
  userId: number,
  expectedPasswordHash: string,
  tokenHash: string,
  expiresAt: Date,
) {
  return db.transaction(async (tx) => {
    await tx.orm.public.User.where({ id: userId }).update({ connectionStatus: "ONLINE" });
    const user = await tx.orm.public.User.where({ id: userId }).first();
    if (!user || user.deletedAt !== null) {
      throw new AccountRepositoryError("Identifiants invalides.", "deleted");
    }
    if (user.passwordHash !== expectedPasswordHash) {
      throw new AccountRepositoryError("Identifiants invalides.", "credentials_changed");
    }
    if (user.accountStatus !== "ACTIVE") {
      throw new AccountRepositoryError(
        user.accountStatus === "SUSPENDED" ? "Compte suspendu." : "Veuillez activer votre compte.",
        user.accountStatus === "SUSPENDED" ? "suspended" : "inactive",
      );
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountRepositoryError("Compte temporairement verrouillé.", "locked");
    }

    const now = new Date();
    await tx.orm.public.Session.where({ userId, revokedAt: null }).update({ revokedAt: now });
    await tx.orm.public.RefreshToken.where({ userId, revokedAt: null }).update({ revokedAt: now });
    const session = await tx.orm.public.Session.create({
      userId,
      expiresAt,
      createdAt: now,
      lastActivityAt: now,
    });
    await tx.orm.public.RefreshToken.create({
      userId,
      sessionId: session.id,
      tokenHash,
      expiresAt,
      createdAt: now,
    });
    await tx.orm.public.User.where({ id: userId }).update({
      lastLoginAt: now,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    const authenticatedUser = await tx.orm.public.User.where({ id: userId }).first();
    if (!authenticatedUser) {
      throw new AccountRepositoryError("Utilisateur non trouvé.", "not_found");
    }
    return { user: authenticatedUser, session };
  });
}

export async function logoutAccount(userId: number) {
  return db.transaction(async (tx) => {
    const user = await tx.orm.public.User.where({ id: userId }).first();
    if (!user) throw new AccountRepositoryError("Utilisateur non trouvé.", "not_found");

    const now = new Date();
    await tx.orm.public.User.where({ id: userId }).update({ connectionStatus: "OFFLINE" });
    await tx.orm.public.Session.where({ userId, revokedAt: null }).update({ revokedAt: now });
    await tx.orm.public.RefreshToken.where({ userId, revokedAt: null }).update({ revokedAt: now });
  });
}

export async function updateAccountStatus(
  userId: number,
  accountStatus: "ACTIVE" | "INACTIVE" | "SUSPENDED",
) {
  return db.transaction(async (tx) => {
    const user = await tx.orm.public.User.where({ id: userId }).first();
    if (!user) throw new AccountRepositoryError("Utilisateur non trouvé.", "not_found");

    await tx.orm.public.User.where({ id: userId }).update({
      accountStatus,
      ...(accountStatus === "ACTIVE" ? {} : { connectionStatus: "OFFLINE" as const }),
    });
    if (accountStatus !== "ACTIVE") {
      const now = new Date();
      await tx.orm.public.Session.where({ userId, revokedAt: null }).update({ revokedAt: now });
      await tx.orm.public.RefreshToken.where({ userId, revokedAt: null }).update({ revokedAt: now });
    }
    return tx.orm.public.User.where({ id: userId }).first();
  });
}

export async function softDeleteAccount(userId: number) {
  return db.transaction(async (tx) => {
    const user = await tx.orm.public.User.where({ id: userId }).first();
    if (!user) throw new AccountRepositoryError("Utilisateur non trouvé.", "not_found");
    if (user.deletedAt !== null) {
      throw new AccountRepositoryError("Ce compte est déjà en attente de suppression.", "deleted");
    }

    const now = new Date();
    await tx.orm.public.User.where({ id: userId }).update({
      deletedAt: now,
      connectionStatus: "OFFLINE",
      pendingEmail: null,
      emailChangeCodeHash: null,
      emailChangeExpiresAt: null,
    });
    await tx.orm.public.Session.where({ userId, revokedAt: null }).update({ revokedAt: now });
    await tx.orm.public.RefreshToken.where({ userId, revokedAt: null }).update({ revokedAt: now });
  });
}

export async function updateAccountRoleAndRevokeSessions(
  userId: number,
  role: "USER" | "ORGANIZER" | "ADMIN",
) {
  return db.transaction(async (tx) => {
    const user = await tx.orm.public.User.where({ id: userId }).first();
    if (!user || user.deletedAt !== null) return null;

    const now = new Date();
    await tx.orm.public.User.where({ id: userId }).update({
      role,
      connectionStatus: "OFFLINE",
    });
    await tx.orm.public.Session.where({ userId, revokedAt: null }).update({ revokedAt: now });
    await tx.orm.public.RefreshToken.where({ userId, revokedAt: null }).update({ revokedAt: now });
    return tx.orm.public.User.where({ id: userId }).first();
  });
}

export async function restoreDeletedAccount(userId: number) {
  return db.transaction(async (tx) => {
    const user = await tx.orm.public.User.where({ id: userId }).first();
    if (!user) throw new AccountRepositoryError("Utilisateur non trouvé.", "not_found");
    if (user.deletedAt === null) {
      throw new AccountRepositoryError("Ce compte n'est pas en attente de suppression.", "not_found");
    }

    const now = new Date();
    await tx.orm.public.User.where({ id: userId }).update({
      deletedAt: null,
      connectionStatus: "OFFLINE",
    });
    await tx.orm.public.Session.where({ userId, revokedAt: null }).update({ revokedAt: now });
    await tx.orm.public.RefreshToken.where({ userId, revokedAt: null }).update({ revokedAt: now });
    return tx.orm.public.User.where({ id: userId }).first();
  });
}

export async function updatePasswordAndRevokeSessions(
  userId: number,
  passwordHash: string,
  expectedPasswordHash?: string,
) {
  return db.transaction(async (tx) => {
    await tx.orm.public.User.where({ id: userId }).update({ connectionStatus: "OFFLINE" });
    const user = await tx.orm.public.User.where({ id: userId }).first();
    if (!user || user.deletedAt !== null) {
      throw new AccountRepositoryError("User not found", "not_found");
    }
    if (expectedPasswordHash && user.passwordHash !== expectedPasswordHash) {
      throw new AccountRepositoryError(
        "Le mot de passe a changé pendant la requête. Veuillez réessayer.",
        "credentials_changed",
      );
    }

    const now = new Date();
    await tx.orm.public.User.where({ id: userId }).update({
      passwordHash,
      lockedUntil: null,
      failedLoginAttempts: 0,
    });
    await tx.orm.public.PasswordResetCode.where({ userId, usedAt: null }).update({ usedAt: now });
    await tx.orm.public.Session.where({ userId, revokedAt: null }).update({ revokedAt: now });
    await tx.orm.public.RefreshToken.where({ userId, revokedAt: null }).update({ revokedAt: now });
  });
}

export async function resetPasswordWithCode(
  userId: number,
  resetCodeId: number,
  passwordHash: string,
) {
  return db.transaction(async (tx) => {
    await tx.orm.public.User.where({ id: userId }).update({ connectionStatus: "OFFLINE" });
    const user = await tx.orm.public.User.where({ id: userId }).first();
    if (!user || user.deletedAt !== null) {
      throw new AccountRepositoryError("Code invalide ou expiré. Demandez un nouveau code.", "invalid_reset_code");
    }

    const resetCode = await tx.orm.public.PasswordResetCode
      .where({ id: resetCodeId, userId, usedAt: null })
      .first();
    if (!resetCode || resetCode.expiresAt.getTime() <= Date.now()) {
      throw new AccountRepositoryError("Code invalide ou expiré. Demandez un nouveau code.", "invalid_reset_code");
    }

    const now = new Date();
    await tx.orm.public.PasswordResetCode.where({ userId, usedAt: null }).update({ usedAt: now });
    await tx.orm.public.User.where({ id: userId }).update({
      passwordHash,
      lockedUntil: null,
      failedLoginAttempts: 0,
    });
    await tx.orm.public.Session.where({ userId, revokedAt: null }).update({ revokedAt: now });
    await tx.orm.public.RefreshToken.where({ userId, revokedAt: null }).update({ revokedAt: now });
  });
}
