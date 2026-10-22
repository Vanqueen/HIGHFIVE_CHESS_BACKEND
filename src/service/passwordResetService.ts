// src/service/passwordResetService.ts

import crypto from "crypto";
import {
  findPasswordResetCodeByHash,
  invalidatePasswordResetCode,
  replaceActivePasswordResetCode,
} from "../repository/password-reset-code.repository";
import { findUser, findUserByEmail } from "../repository/user.repository";
import {
  resetPasswordWithCode,
  updatePasswordAndRevokeSessions,
} from "../repository/account.repository";
import { digestMatches, resetDigest } from "../utils/hash.util";
import { hashPassword, passwordValidation, verifyPassword } from "../utils/password";
import HttpError, { rethrowServiceError } from "./errorService";
import { sendPasswordResetCode } from "./emailService";
import { epochMilliseconds } from "../utils/temporalDate.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;

export class PasswordResetService {
  private static async getValidResetCode(userId: number, code: string) {
    const user = await findUser(userId);
    if (!user || user.deletedAt !== null) return null;
    const codeHash = resetDigest(`code:${userId}`, String(code ?? ""));
    const resetCode = await findPasswordResetCodeByHash(userId, codeHash);
    if (!resetCode || resetCode.usedAt || !resetCode.expiresAt) return null;
    if (epochMilliseconds(resetCode.expiresAt) <= Date.now()) {
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
  ) {
    try {
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new HttpError("Mot de passe actuel invalide.", 401, false);
      }
      if (!passwordValidation(newPassword)) {
        throw new HttpError(
          "Le mot de passe doit contenir au moins 8 caractères, une lettre majuscule, une lettre minuscule et un chiffre.",
          422,
          false,
        );
      }

      await updatePasswordAndRevokeSessions(
        userId,
        await hashPassword(newPassword),
        user.passwordHash,
      );
      return {
        success: true,
        message: "Mot de passe modifié. Veuillez vous reconnecter.",
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la modification du mot de passe :");
    }
  }

  static async forgotPassword(email: string) {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const genericResponse = {
        message:
          "Si un compte correspond à cette adresse, un code de vérification vient d’être envoyé.",
      };
      if (!EMAIL_RE.test(normalizedEmail)) return genericResponse;
      const user = await findUserByEmail(normalizedEmail);
      if (!user || user.deletedAt !== null) return genericResponse;

      const code = String(crypto.randomInt(100000, 1000000));
      const codeHash = resetDigest(`code:${user.id}`, code);
      const result = await replaceActivePasswordResetCode(
        user.id,
        codeHash,
        new Date(Date.now() + RESET_CODE_TTL_MS),
      );
      void sendPasswordResetCode({
        to: user.email,
        username: user.username,
        code,
      }).catch(async (err) => {
        await invalidatePasswordResetCode(result.id);
        console.error(
          "Erreur lors de l'envoi du code de réinitialisation :",
          err instanceof Error ? err.message : err,
        );
      });

      return genericResponse;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la demande de réinitialisation du mot de passe :");
    }
  }

  static async verifyResetCode(userId: number, code: string) {
    try {
      const resetCode = await PasswordResetService.getValidResetCode(
        userId,
        code,
      );
      if (!resetCode) {
        throw new HttpError("Code invalide ou expiré. Demandez un nouveau code.", 400, false);
      }
      return {
        success: true,
        message: "Code de réinitialisation vérifié avec succès.",
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la vérification du code de réinitialisation :");
    }
  }

  static async resetPassword(
    userId: number,
    code: string,
    newPassword: string,
  ) {
    try {
      if (!passwordValidation(newPassword)) {
        throw new HttpError(
          "Le mot de passe doit contenir au moins 8 caractères, une lettre majuscule, une lettre minuscule et un chiffre.",
          422,
          false,
        );
      }
      const resetCode = await PasswordResetService.getValidResetCode(
        userId,
        code,
      );
      if (!resetCode) {
        throw new HttpError("Code invalide ou expiré. Demandez un nouveau code.", 400, false);
      }

      await resetPasswordWithCode(
        userId,
        resetCode.id,
        await hashPassword(newPassword),
      );
      return {
        success: true,
        message: "Mot de passe réinitialisé. Veuillez vous reconnecter.",
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la réinitialisation du mot de passe :");
    }
  }
}
