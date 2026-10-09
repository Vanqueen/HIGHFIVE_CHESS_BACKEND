// src/service/passwordResetService.ts

import crypto from "crypto";
import {
  createPasswordResetCode,
  findPasswordResetCodeByHash,
  invalidateAllPasswordResetCodes,
  invalidatePasswordResetCode,
} from "../repository/password-reset-code.repository";
import { revokeAllUserRefreshTokens } from "../repository/refresh-token.repository";
import { revokeAllUserSessions } from "../repository/session.repository";
import {
  findUser,
  findUserByEmail,
  setConnectionStatus,
  unlockUser,
  updatePassword,
} from "../repository/user.repository";
import { digestMatches, resetDigest } from "../utils/hash.util";
import {
  hashPassword,
  passwordValidation,
  verifyPassword,
} from "../utils/password";
import HttpError from "./errorService";
import { sendPasswordResetCode } from "./emailService";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;

export class PasswordResetService {
  private static async getValidResetCode(userId: number, code: string) {
    const user = await findUser(userId);
    if (!user || user.deletedAt !== null) return null;
    const codeHash = resetDigest(`code:${userId}`, String(code ?? ""));
    const resetCode = await findPasswordResetCodeByHash(userId, codeHash);
    if (!resetCode || resetCode.usedAt || !resetCode.expiresAt) return null;
    if (resetCode.expiresAt.getTime() <= Date.now()) {
      await invalidatePasswordResetCode(resetCode.id);
      return null;
    }
    if (!digestMatches(resetCode.codeHash, codeHash)) {
      await invalidatePasswordResetCode(resetCode.id);
      return null;
    }
    return resetCode;
  }

  static async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    next: (error: any) => void,
  ) {
    try {
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        return next(new HttpError("Mot de passe actuel invalide.", 401, false));
      }
      if (!passwordValidation(newPassword)) {
        return next(
          new HttpError(
            "Le mot de passe doit contenir au moins 8 caractères, une lettre majuscule, une lettre minuscule et un chiffre.",
            422,
            false,
          ),
        );
      }

      await updatePassword(userId, await hashPassword(newPassword));
      await invalidateAllPasswordResetCodes(userId);
      await unlockUser(userId);
      await revokeAllUserSessions(userId);
      await revokeAllUserRefreshTokens(userId);
      await setConnectionStatus(userId, "OFFLINE");
      return {
        success: true,
        message: "Mot de passe modifié. Veuillez vous reconnecter.",
      };
    } catch (error) {
      console.error(
        "Erreur lors de la modification du mot de passe :",
        (error as Error).message,
      );
      return next(
        new HttpError(
          "Erreur serveur. Veuillez réessayer plus tard.",
          500,
          false,
        ),
      );
    }
  }

  static async forgotPassword(email: string, next: (error: any) => void) {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const genericResponse = {
        message:
          "Si un compte correspond à cette adresse, un code de vérification vient d’être envoyé.",
      };
      if (!EMAIL_RE.test(normalizedEmail)) return genericResponse;
      const user = await findUserByEmail(normalizedEmail);
      if (!user || user.deletedAt !== null) return genericResponse;

      const now = Date.now();
      const code = String(crypto.randomInt(100000, 1000000));
      const codeHash = resetDigest(`code:${user.id}`, code);
      await invalidateAllPasswordResetCodes(user.id);
      const result = await createPasswordResetCode(
        user.id,
        codeHash,
        new Date(now + RESET_CODE_TTL_MS),
      );
      void sendPasswordResetCode({
        to: user.email,
        username: user.username,
        code,
      }).catch(async (err) => {
        await invalidatePasswordResetCode(result.id);
        console.error(
          "Erreur lors de l'envoi du code de réinitialisation :",
          err.message,
        );
      });

      return genericResponse;
    } catch (error) {
      console.error(
        "Erreur lors de la réinitialisation du mot de passe :",
        (error as Error).message,
      );
      return next(
        new HttpError(
          "Erreur serveur. Veuillez réessayer plus tard.",
          500,
          false,
        ),
      );
    }
  }

  static async verifyResetCode(
    userId: number,
    code: string,
    next: (error: any) => void,
  ) {
    try {
      const resetCode = await PasswordResetService.getValidResetCode(
        userId,
        code,
      );
      if (!resetCode) {
        return next(
          new HttpError(
            "Code invalide ou expiré. Demandez un nouveau code.",
            400,
            false,
          ),
        );
      }
      return {
        success: true,
        message: "Code de réinitialisation vérifié avec succès.",
      };
    } catch (error) {
      console.error(
        "Erreur lors de la vérification du code de réinitialisation :",
        (error as Error).message,
      );
      return next(
        new HttpError(
          "Erreur serveur. Veuillez réessayer plus tard.",
          500,
          false,
        ),
      );
    }
  }

  static async resetPassword(
    userId: number,
    code: string,
    newPassword: string,
    next: (error: any) => void,
  ) {
    try {
      if (!passwordValidation(newPassword)) {
        return next(
          new HttpError(
            "Le mot de passe doit contenir au moins 8 caractères, une lettre majuscule, une lettre minuscule et un chiffre.",
            422,
            false,
          ),
        );
      }
      const resetCode = await PasswordResetService.getValidResetCode(
        userId,
        code,
      );
      if (!resetCode) {
        return next(
          new HttpError(
            "Code invalide ou expiré. Demandez un nouveau code.",
            400,
            false,
          ),
        );
      }

      await updatePassword(userId, await hashPassword(newPassword));
      await invalidateAllPasswordResetCodes(userId);
      await unlockUser(userId);
      await revokeAllUserSessions(userId);
      await revokeAllUserRefreshTokens(userId);
      await setConnectionStatus(userId, "OFFLINE");
      return {
        success: true,
        message: "Mot de passe réinitialisé. Veuillez vous reconnecter.",
      };
    } catch (error) {
      console.error(
        "Erreur lors de la réinitialisation du mot de passe :",
        (error as Error).message,
      );
      return next(
        new HttpError(
          "Erreur serveur. Veuillez réessayer plus tard.",
          500,
          false,
        ),
      );
    }
  }
}
