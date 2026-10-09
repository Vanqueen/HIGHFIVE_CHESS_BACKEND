// src/service/userService.ts

import { randomInt, randomUUID } from "crypto";
import { readFile, rm, stat } from "node:fs/promises";
import path from "path";
import { tmpdir } from "node:os";
import { type UploadedFile } from "express-fileupload";

import {
  clearPendingEmailChange,
  completePendingEmailChange,
  findUser,
  findUserByEmail,
  findUserByUsername,
  findUsers,
  permanentlyDeleteUser as deleteUserRecord,
  savePendingEmailChange,
  updateAvatar,
  updateUsername,
} from "../repository/user.repository";
import HttpError, { rethrowServiceError } from "./errorService";
import cloudinary from "../utils/cloudinary";
import {
  restoreDeletedAccount,
  softDeleteAccount,
  updateAccountStatus,
  updateAccountRoleAndRevokeSessions,
} from "../repository/account.repository";
import { digestMatches, resetDigest } from "../utils/hash.util";
import { sendEmailChangeCode } from "./emailService";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_CHANGE_TTL_MS = 10 * 60 * 1000;

function hasDatabaseErrorCode(error: unknown, ...codes: string[]) {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code);
}

function cloudinaryPublicId(avatarUrl: string | null, storedPublicId?: string | null) {
  if (storedPublicId) return storedPublicId;
  if (!avatarUrl) return null;
  try {
    const url = new URL(avatarUrl);
    if (url.hostname !== "res.cloudinary.com") return null;
    const match = url.pathname.match(/\/image\/upload\/(?:[^/]+\/)*v\d+\/(.+)$/);
    return match?.[1]?.replace(/\.[^/.]+$/, "") ?? null;
  } catch {
    return null;
  }
}

function detectImageMimeType(data: Buffer) {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (data.length >= 6) {
    const signature = data.toString("ascii", 0, 6);
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  if (
    data.length >= 12 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";
  return null;
}

export class UserService {
  static async getAllUsers() {
    try {
      const users = await findUsers();
      return { success: true, data: users };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des utilisateurs :");
    }
  }

  static async changeUserRole(
    actorId: number,
    userId: number,
    role: "USER" | "ORGANIZER" | "ADMIN",
  ) {
    try {
      const actor = await findUser(actorId);
      if (
        !actor ||
        actor.deletedAt !== null ||
        actor.accountStatus !== "ACTIVE" ||
        (actor.lockedUntil !== null && actor.lockedUntil > new Date()) ||
        actor.role !== "ADMIN"
      ) {
        throw new HttpError("Action réservée aux administrateurs.", 403, false);
      }
      if (!["USER", "ORGANIZER", "ADMIN"].includes(role)) {
        throw new HttpError("Rôle invalide.", 422, false);
      }
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      const updatedUser = await updateAccountRoleAndRevokeSessions(userId, role);
      if (!updatedUser) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      return { success: true, data: UserService.sanitizeUser(updatedUser) };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la modification du rôle de l'utilisateur :");
    }
  }

  static async getUserById(userId: number) {
    try {
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      return { success: true, data: UserService.sanitizeUser(user) };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération de l'utilisateur :");
    }
  }

  static async changeUserEmail(
    userId: number,
    email: string,
  ) {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalizedEmail)) {
        throw new HttpError("Format d'email invalide.", 422, false);
      }
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      if (normalizedEmail === user.email) {
        throw new HttpError("Cette adresse e-mail est déjà associée au compte.", 409, false);
      }
      const existingUser = await findUserByEmail(normalizedEmail);
      if (existingUser && existingUser.id !== userId) {
        throw new HttpError("Cet email est déjà utilisé.", 409, false);
      }

      const code = String(randomInt(100000, 1000000));
      const codeHash = resetDigest(
        `email-change:${userId}`,
        `${normalizedEmail}:${code}`,
      );
      const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
      await savePendingEmailChange(userId, normalizedEmail, codeHash, expiresAt);
      try {
        await sendEmailChangeCode({
          to: normalizedEmail,
          username: user.username,
          code,
        });
      } catch (error) {
        await clearPendingEmailChange(userId, codeHash);
        throw error;
      }

      return {
        success: true,
        message: "Un code de vérification a été envoyé à la nouvelle adresse e-mail.",
      };
    } catch (error) {
      if (hasDatabaseErrorCode(error, "23505", "P2002")) {
        throw new HttpError("Cette adresse e-mail est déjà utilisée ou fait l'objet d'une demande.", 409, false);
      }
      rethrowServiceError(error, "Erreur lors de la modification de l'email :");
    }
  }

  static async confirmUserEmailChange(userId: number, code: string) {
    try {
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      if (
        !user.pendingEmail ||
        !user.emailChangeCodeHash ||
        !user.emailChangeExpiresAt ||
        user.emailChangeExpiresAt.getTime() <= Date.now()
      ) {
        throw new HttpError("Code invalide ou expiré. Demandez un nouveau code.", 400, false);
      }

      const expectedHash = resetDigest(
        `email-change:${userId}`,
        `${user.pendingEmail}:${String(code ?? "")}`,
      );
      if (!digestMatches(user.emailChangeCodeHash, expectedHash)) {
        throw new HttpError("Code invalide ou expiré. Demandez un nouveau code.", 400, false);
      }

      const updated = await completePendingEmailChange(
        userId,
        user.pendingEmail,
        expectedHash,
        user.emailChangeExpiresAt,
      );
      if (!updated) {
        throw new HttpError("Code invalide ou déjà utilisé.", 400, false);
      }
      const updatedUser = await findUser(userId);
      if (!updatedUser) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      return {
        success: true,
        message: "Adresse e-mail vérifiée. Veuillez vous reconnecter.",
        data: UserService.sanitizeUser(updatedUser),
      };
    } catch (error) {
      if (hasDatabaseErrorCode(error, "23505", "P2002")) {
        throw new HttpError("Cette adresse e-mail est déjà utilisée.", 409, false);
      }
      rethrowServiceError(error, "Erreur lors de la confirmation de l'email :");
    }
  }

  static async changeUsername(
    userId: number,
    username: string,
  ) {
    try {
      const normalizedUsername = username.trim();
      if (!normalizedUsername) {
        throw new HttpError("Le nom d'utilisateur est requis.", 422, false);
      }
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      const existingUser = await findUserByUsername(normalizedUsername);
      if (existingUser && existingUser.id !== userId) {
        throw new HttpError("Ce nom d'utilisateur est déjà utilisé.", 409, false);
      }

      await updateUsername(userId, normalizedUsername);
      const updatedUser = await findUser(userId);
      if (!updatedUser) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      return { success: true, data: UserService.sanitizeUser(updatedUser) };
    } catch (error) {
      if (hasDatabaseErrorCode(error, "23505", "P2002")) {
        throw new HttpError("Ce nom d'utilisateur est déjà utilisé.", 409, false);
      }
      rethrowServiceError(error, "Erreur lors de la modification du nom d'utilisateur :");
    }
  }

  static async changeUserStatus(
    userId: number,
    newStatus: "ACTIVE" | "INACTIVE" | "SUSPENDED",
  ) {
    try {
      const updatedUser = await updateAccountStatus(userId, newStatus);
      if (!updatedUser) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      return { success: true, data: UserService.sanitizeUser(updatedUser) };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la modification du statut de l'utilisateur :");
    }
  }

  static async changeUserAvatar(
    userId: number,
    newAvatarUrl: UploadedFile,
  ) {
    try {
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      if (!newAvatarUrl) {
        throw new HttpError("Fichier d'avatar manquant.", 400, false);
      }

      if (newAvatarUrl.size > 5 * 1024 * 1024) {
        throw new HttpError(
          "La taille de l'avatar dépasse la limite autorisée de 5MB.",
          400,
          false,
        );
      }

      const uploadPath = path.join(tmpdir(), `avatar-${randomUUID()}`);
      let newPublicId: string | null = null;
      try {
        await newAvatarUrl.mv(uploadPath);
        const uploadedFileSize = (await stat(uploadPath)).size;
        if (uploadedFileSize > 5 * 1024 * 1024) {
          throw new HttpError(
            "La taille de l'avatar dépasse la limite autorisée de 5MB.",
            400,
            false,
          );
        }
        const detectedMimeType = detectImageMimeType(await readFile(uploadPath));
        if (!detectedMimeType || detectedMimeType !== newAvatarUrl.mimetype) {
          throw new HttpError("Le fichier doit être une image PNG, JPEG, GIF ou WebP valide.", 415, false);
        }

        const result = await cloudinary.uploader.upload(uploadPath, {
          resource_type: "image",
          folder: "avatars",
        });
        if (!result.secure_url || !result.public_id) {
          throw new HttpError("Cloudinary n'a pas retourné les informations de l'image.", 422, false);
        }
        newPublicId = result.public_id;
        const updated = await updateAvatar(userId, result.secure_url, result.public_id);
        if (!updated) {
          throw new HttpError("Utilisateur non trouvé.", 404, false);
        }
      } catch (error) {
        if (newPublicId) {
          try {
            await cloudinary.uploader.destroy(newPublicId, { resource_type: "image" });
          } catch (cleanupError) {
            console.error("Impossible de supprimer le nouvel avatar Cloudinary après échec :", cleanupError);
          }
        }
        throw error;
      } finally {
        await rm(uploadPath, { force: true });
      }

      const oldPublicId = cloudinaryPublicId(user.avatarUrl, user.avatarPublicId);
      let cleanupWarning: string | undefined;
      if (oldPublicId && oldPublicId !== newPublicId) {
        try {
          const deletion = await cloudinary.uploader.destroy(oldPublicId, { resource_type: "image" });
          if (deletion.result !== "ok" && deletion.result !== "not found") {
            cleanupWarning = "L'ancien avatar n'a pas pu être supprimé de Cloudinary.";
            console.error(cleanupWarning, { publicId: oldPublicId, result: deletion.result });
          }
        } catch (error) {
          cleanupWarning = "L'ancien avatar n'a pas pu être supprimé de Cloudinary.";
          console.error(cleanupWarning, error);
        }
      }
      const updatedUser = await findUser(userId);
      if (!updatedUser) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      return {
        success: true,
        message: cleanupWarning ?? "Photo de profil mise à jour !",
        ...(cleanupWarning ? { warning: cleanupWarning } : {}),
        data: UserService.sanitizeUser(updatedUser),
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la modification de l'avatar de l'utilisateur :");
    }
  }

  static async markUserForDeletion(userId: number) {
    try {
      await softDeleteAccount(userId);
      return { success: true, message: "Utilisateur marqué pour suppression." };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la suppression de l'utilisateur :");
    }
  }

  static async restoreDeletedUser(actorId: number, userId: number) {
    try {
      const actor = await findUser(actorId);
      const user = await findUser(userId);
      if (!user || user.deletedAt === null) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      if (
        !actor ||
        actor.deletedAt !== null ||
        actor.accountStatus !== "ACTIVE" ||
        (actor.lockedUntil !== null && actor.lockedUntil > new Date()) ||
        actor.role !== "ADMIN"
      ) {
        throw new HttpError("Action réservée aux administrateurs.", 403, false);
      }
      await restoreDeletedAccount(userId);
      return { success: true, message: "Utilisateur restauré avec succès." };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la restauration de l'utilisateur :");
    }
  }

  static async permanentlyDeleteUser(actorId: number, userId: number) {
    try {
      const actor = await findUser(actorId);
      if (
        !actor ||
        actor.deletedAt !== null ||
        actor.accountStatus !== "ACTIVE" ||
        (actor.lockedUntil !== null && actor.lockedUntil > new Date()) ||
        actor.role !== "ADMIN"
      ) {
        throw new HttpError("Action réservée aux administrateurs.", 403, false);
      }
      const user = await findUser(userId);
      if (!user) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      if (user.deletedAt === null) {
        throw new HttpError("Le compte doit d'abord être placé en attente de suppression.", 409, false);
      }
      await deleteUserRecord(userId);
      const avatarId = cloudinaryPublicId(user.avatarUrl, user.avatarPublicId);
      if (avatarId) {
        try {
          const deletion = await cloudinary.uploader.destroy(avatarId, { resource_type: "image" });
          if (deletion.result !== "ok" && deletion.result !== "not found") {
            const warning = "Le compte a été supprimé, mais son avatar Cloudinary n'a pas pu être supprimé.";
            console.error(warning, { publicId: avatarId, result: deletion.result });
            return { success: true, message: "Utilisateur supprimé définitivement.", warning };
          }
        } catch (error) {
          const warning = "Le compte a été supprimé, mais son avatar Cloudinary n'a pas pu être supprimé.";
          console.error(warning, error);
          return { success: true, message: "Utilisateur supprimé définitivement.", warning };
        }
      }
      return { success: true, message: "Utilisateur supprimé définitivement." };
    } catch (error) {
      if (hasDatabaseErrorCode(error, "23503", "P2003")) {
        throw new HttpError(
          "La suppression est bloquée par des données liées, notamment des tournois organisés par cet utilisateur.",
          409,
          false,
        );
      }
      rethrowServiceError(error, "Erreur lors de la suppression définitive de l'utilisateur :");
    }
  }

  static sanitizeUser(user: NonNullable<Awaited<ReturnType<typeof findUser>>>) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      accountStatus: user.accountStatus,
      connectionStatus: user.connectionStatus,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
