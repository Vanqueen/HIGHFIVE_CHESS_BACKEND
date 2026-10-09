// src/service/userService.ts

import { randomUUID } from "crypto";
import path from "path";
import { type UploadedFile } from "express-fileupload";

import {
  findUser,
  findUserByEmail,
  findUserByUsername,
  findUsers,
  permanentlyDeleteUser,
  restoreDeletedUser,
  updateAvatar,
  updateEmail,
  updateUsername,
  updateUser,
} from "../repository/user.repository";
import HttpError, { rethrowServiceError } from "./errorService";
import cloudinary from "../utils/cloudinary";
import { softDeleteAccount, updateAccountStatus } from "../repository/account.repository";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    userId: number,
    role: "USER" | "ORGANIZER" | "ADMIN",
  ) {
    try {
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      await updateUser(userId, { role });
      const updatedUser = await findUser(userId);
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
      if (!user) {
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
      const existingUser = await findUserByEmail(normalizedEmail);
      if (existingUser && existingUser.id !== userId) {
        throw new HttpError("Cet email est déjà utilisé.", 409, false);
      }

      await updateEmail(userId, normalizedEmail);
      const updatedUser = await findUser(userId);
      if (!updatedUser) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      return { success: true, data: UserService.sanitizeUser(updatedUser) };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la modification de l'email :");
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
      if (!user) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      // Mettre à jour l'avatar de l'utilisateur dans la base de données
      // Implémenter la logique de mise à jour de l'avatar ici
      if (!newAvatarUrl) {
        throw new HttpError("URL de l'avatar manquante.", 400, false);
      }

      // ✅ Vérifie la taille du fichier (ici, max 500 ko)
      if (newAvatarUrl.size > 5 * 1024 * 1024) {
        // 5MB
        throw new HttpError(
          "La taille de l'avatar dépasse la limite autorisée de 5MB.",
          400,
          false,
        );
      }

      // ✅ Génération d’un nom unique pour le fichier uploadé
      // On sépare le nom du fichier et son extension, puis on ajoute un UUID
      let fileName = newAvatarUrl.name;
      let splittedFilename = fileName.split(".");
      let newFilename =
        splittedFilename[0] +
        randomUUID() +
        "." +
        splittedFilename[splittedFilename.length - 1];

      // ✅ Définit le chemin complet où le fichier sera temporairement enreg istré sur le serveur
      const uploadPath = path.join(__dirname, "..", "uploads", newFilename);

      // ✅ Déplace le fichier uploadé vers le dossier "uploads"
      await newAvatarUrl.mv(uploadPath);

      // ✅ Upload du fichier sur Cloudinary (service de stockage d’images)
      //    On indique que c’est une ressource de type "image"
      const result = await cloudinary.uploader.upload(uploadPath, {
        resource_type: "image",
        folder: "avatars",
      });

      // ✅ Vérifie que Cloudinary a bien retourné une URL d’image valide
      if (!result.secure_url) {
        throw new HttpError("Couldn't upload image to cloudinary", 422, false);
      }

      // ✅ Met à jour le champ "profilePhoto" de l'utilisateur connecté
      //    avec l'URL sécurisée retournée par Cloudinary
      await updateAvatar(userId, result.secure_url);
      const updatedUser = await findUser(userId);
      if (!updatedUser) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      return {
        success: true,
        message: "Photo de profile mise à jour !",
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

  static async restoreDeletedUser(userId: number) {
    try {
      const user = await findUser(userId);
      if (!user) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      if (user.deletedAt === null) {
        return {
          success: false,
          message: "Ce compte n'est pas en attente de suppression.",
        };
      }
      await restoreDeletedUser(userId);
      return { success: true, message: "Utilisateur restauré avec succès." };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la restauration de l'utilisateur :");
    }
  }

  static async permanentlyDeleteUser(userId: number) {
    try {
      const user = await findUser(userId);
      if (!user) {
        throw new HttpError("Utilisateur non trouvé.", 404, false);
      }
      await permanentlyDeleteUser(userId);
      return { success: true, message: "Utilisateur supprimé définitivement." };
    } catch (error) {
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
