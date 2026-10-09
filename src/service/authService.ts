import {
  createUser,
  findUser,
  findUserByEmail,
  findUserByUsername,
  recordFailedLogin,
  unlockUser as unlockUserRecord,
} from "../repository/user.repository";
import {
  createAuthenticatedSession,
  logoutAccount,
} from "../repository/account.repository";
import { emailValidation } from "../utils/email";
import { hashPassword, passwordValidation, verifyPassword } from "../utils/password";
import { generateToken, hashToken } from "../utils/token";
import HttpError, { rethrowServiceError } from "./errorService";

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

  static async register(userData: { username: string; email: string; password: string }) {
    try {
      const { username, email, password } = userData;
      if (!username || !email || !password) {
        throw new HttpError("Tous les champs sont requis.", 422, false);
      }

      const normalizedUsername = username.trim();
      if (!normalizedUsername) {
        throw new HttpError("Le nom d'utilisateur est requis.", 422, false);
      }
      if (!passwordValidation(password)) {
        throw new HttpError(
          "Le mot de passe doit contenir au moins 8 caractères, une lettre majuscule, une lettre minuscule et un chiffre.",
          422,
          false,
        );
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (!emailValidation(normalizedEmail)) {
        throw new HttpError("Format d'email invalide.", 422, false);
      }

      const existingUser = await findUserByEmail(normalizedEmail);
      if (existingUser) {
        throw new HttpError(
          existingUser.deletedAt !== null
            ? "Cet email est associé à un compte en attente de suppression."
            : "Cet email est déjà utilisé.",
          409,
          false,
        );
      }
      if (await findUserByUsername(normalizedUsername)) {
        throw new HttpError("Ce nom d'utilisateur est déjà utilisé.", 409, false);
      }

      const user = await createUser(
        normalizedEmail,
        normalizedUsername,
        await hashPassword(password),
      );
      return {
        success: true,
        message: "Utilisateur enregistré avec succès.",
        user: AuthService.sanitizeUser(user),
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'enregistrement de l'utilisateur :");
    }
  }

  static async login(email: string, password: string) {
    const maxAttempts = 5;
    try {
      const user = await findUserByEmail(email.trim().toLowerCase());
      if (!user || user.deletedAt !== null) {
        throw new HttpError("Identifiants invalides.", 401, false);
      }
      if (user.accountStatus !== "ACTIVE") {
        throw new HttpError(
          user.accountStatus === "SUSPENDED"
            ? "Compte suspendu."
            : "Veuillez activer votre compte.",
          401,
          false,
        );
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new HttpError("Compte temporairement verrouillé.", 423, false);
      }

      if (!(await verifyPassword(user.passwordHash, password))) {
        await recordFailedLogin(
          user.id,
          maxAttempts,
          new Date(Date.now() + 15 * 60 * 1000),
        );
        throw new HttpError("Identifiants invalides.", 401, false);
      }

      const refreshSecret = process.env.JWT_REFRESH_SECRET;
      const accessSecret = process.env.JWT_ACCESS_SECRET;
      if (!refreshSecret || !accessSecret) {
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
        refreshSecret,
        refreshTtlSeconds,
      );
      const tokenHash = await hashToken(refreshToken);

      const authenticatedUser = await createAuthenticatedSession(
        user.id,
        user.passwordHash,
        tokenHash,
        refreshExpiresAt,
      );

      if (!authenticatedUser) {
        throw new Error("Utilisateur introuvable après authentification");
      }
      return {
        success: true,
        user: {
          ...AuthService.sanitizeUser(authenticatedUser),
          refreshToken: { token: refreshToken, expiresAt: refreshExpiresAt },
        },
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la connexion de l'utilisateur :");
    }
  }

  static async logout(userId: number) {
    try {
      await logoutAccount(userId);
      return { success: true };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la déconnexion de l'utilisateur :");
    }
  }

  static async unlockUser(userId: number) {
    try {
      const user = await findUser(userId);
      if (!user) throw new HttpError("Utilisateur non trouvé.", 404, false);
      await unlockUserRecord(userId);
      return { success: true, message: "Utilisateur débloqué avec succès." };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du déblocage de l'utilisateur :");
    }
  }
}
