// src/service/authService.ts

import { createRefreshToken, revokeAllUserRefreshTokens } from "../repository/refresh-token.repository";
import { revokeAllUserSessions } from "../repository/session.repository";
import {
  createUser,
  findUser,
  findUserByEmail,
  findUserByUsername,
  recordFailedLogin,
  setConnectionStatus,
  unlockUser,
} from "../repository/user.repository";
import { emailValidation } from "../utils/email";
import { hashPassword, passwordValidation, verifyPassword } from "../utils/password";
import { generateToken, hashToken } from "../utils/token";
import HttpError from "./errorService";
import { db } from "../prisma/db.ts";

export class AuthService {
  static sanitizeUser(user: NonNullable<Awaited<ReturnType<typeof findUser>>>) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      role: user.role,
      accountStatus: user.accountStatus,
      connectionStatus: user.connectionStatus,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  static async register(
    userData: { username: string; email: string; password: string },
    next: (error: any) => void
  ) {
    const { username, email, password } = userData;
    try {
      if (!username || !email || !password) {
        return { success: false, error: "Tout les champs sont requis", statusCode: 422 };
      }
      const normalizedUsername = username.trim();
      if (!normalizedUsername) {
        return { success: false, error: "Le nom d'utilisateur est requis", statusCode: 422 };
      }

      const isPasswordValid = passwordValidation(password);
      if (!isPasswordValid) {
        return { success: false, error: "Le mot de passe doit contenir au moins 8 caractères, une lettre majuscule, une lettre minuscule et un chiffre", statusCode: 422 };
      }

      const normalizedEmail = email.trim().toLowerCase();
      const validatEmail = emailValidation(normalizedEmail)
      if (!validatEmail) {
        return { success: false, error: "Format d'email invalide", statusCode: 422 };
      }

      const existingUser = await findUserByEmail(normalizedEmail);
      if (existingUser && existingUser.deletedAt !== null) {
        return { success: false, error: "Cet email est temporaiment supprimer", statusCode: 422 };
      }

      if (existingUser) {
        return { success: false, error: "Cet email est déjà utilisé", statusCode: 422 };
      }

      const existingUsername = await findUserByUsername(normalizedUsername);
      if (existingUsername) {
        return { success: false, error: "Ce nom d'utilisateur est déjà utilisé", statusCode: 422 };
      }

      const hashedPassword = await hashPassword(password);
      const user = await createUser(normalizedEmail, normalizedUsername, hashedPassword);
      if (!user) {
        return { success: false, error: "Échec de la création de l'utilisateur", statusCode: 422 };
      }

      const userResponse = AuthService.sanitizeUser(user);

      return { success: true, message: "Utilisateur enregistré avec succès.", user: userResponse };
    } catch (error) {
      console.error("Une erreur est survenue lors de l'enregistrement de l'utilisateur :", (error as Error).message);
      return next(new HttpError("Erreur serveur. Veuillez réessayer plus tard.", 500, false));
    }
  }

  static async login(email: string, password: string, next: (error: any) => void) {
    const MAX_ATTEMPTS = 5;
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const user = await findUserByEmail(normalizedEmail);
      if (!user || user.deletedAt !== null) {
        return { success: false, error: "Identifiants invalides", statusCode: 401 };
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return { success: false, error: "Compte temporairement verrouillé", statusCode: 423 };
      }

      const isPasswordValid = await verifyPassword(user.passwordHash, password);
      if (!isPasswordValid) {
        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        await recordFailedLogin(user.id, MAX_ATTEMPTS, lockedUntil);
        return { success: false, error: "Identifiants invalides", statusCode: 401 };
      }

      const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
      const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
      if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
        throw new Error("JWT secrets are not configured");
      }

      const refreshTtlSeconds = Number(process.env.JWT_REFRESH_EXPIRES_IN);
      if (!Number.isFinite(refreshTtlSeconds) || refreshTtlSeconds <= 0) {
        throw new Error("JWT_REFRESH_EXPIRES_IN must be a positive number");
      }
      const refreshExpiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);
      const refreshToken = generateToken(
        user,
        "refresh",
        JWT_REFRESH_SECRET,
        refreshTtlSeconds,
      );
      const hashedRefreshToken = await hashToken(refreshToken);
      const authenticatedUser = await db.transaction(async (tx) => {
        // Updating the user row serializes concurrent logins and preserves the single-session policy.
        await tx.orm.public.User.where({ id: user.id }).update({ connectionStatus: "ONLINE" });
        const currentUser = await tx.orm.public.User.where({ id: user.id }).first();
        if (!currentUser || currentUser.deletedAt !== null) {
          throw new HttpError("Identifiants invalides", 401, false);
        }
        if (currentUser.accountStatus !== "ACTIVE") {
          throw new HttpError(
            currentUser.accountStatus === "SUSPENDED" ? "Compte suspendu" : "Veuillez activer votre compte",
            401,
            false,
          );
        }
        if (currentUser.lockedUntil && currentUser.lockedUntil > new Date()) {
          throw new HttpError("Compte temporairement verrouillé", 423, false);
        }

        // Keep only the newly created session active for this user.
        await tx.orm.public.Session.where({ userId: user.id, revokedAt: null })
          .update({ revokedAt: new Date() });
        await tx.orm.public.RefreshToken.where({ userId: user.id, revokedAt: null })
          .update({ revokedAt: new Date() });
        const session = await tx.orm.public.Session.create({
          userId: user.id,
          expiresAt: refreshExpiresAt,
          createdAt: new Date(),
          lastActivityAt: new Date(),
        });
        await tx.orm.public.RefreshToken.create({
          userId: user.id,
          sessionId: session.id,
          tokenHash: hashedRefreshToken,
          expiresAt: refreshExpiresAt,
          createdAt: new Date(),
        });
        await tx.orm.public.User.where({ id: user.id }).update({
          lastLoginAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        });
        return tx.orm.public.User.where({ id: user.id }).first();
      });
      if (!authenticatedUser) throw new Error("Utilisateur introuvable après authentification");

      const userResponse = {
        ...AuthService.sanitizeUser(authenticatedUser),
        refreshToken: {
          token: refreshToken,
          expiresAt: refreshExpiresAt,
        },
      };

      return { success: true, user: userResponse };
    } catch (error) {
      if (error instanceof HttpError) {
        return {
          success: false,
          error: error.message,
          statusCode: error.code,
        };
      }
      console.error("Erreur lors de la connexion de l'utilisateur:", (error as Error).message);
      return next(new HttpError("Erreur serveur. Veuillez réessayer plus tard.", 500, false));
    }
  }

  static async logout(userId: number, next: (error: any) => void) {
    try {
      const user = await findUser(userId);
      if (!user) {
        return { success: false, error: "Utilisateur non trouvé", statusCode: 404 };
      }
      await setConnectionStatus(userId, "OFFLINE");
      await revokeAllUserSessions(userId);
      await revokeAllUserRefreshTokens(userId);
      return { success: true };
    } catch (error) {
      console.error("Erreur lors de la déconnexion de l'utilisateur:", (error as Error).message);
      return next(new HttpError("Erreur serveur. Veuillez réessayer plus tard.", 500, false));
    }
  }

  static async unlockUser(userId: number, next: (error: any) => void) {
    try {
      const user = await findUser(userId);
      if (!user) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      await unlockUser(userId);
      return { success: true, message: "Utilisateur débloqué avec succès." };
    } catch (error) {
      console.error("Erreur lors du déblocage de l'utilisateur :", (error as Error).message);
      return next(new HttpError("Erreur serveur. Veuillez réessayer plus tard.", 500, false));
    }
  }
}
