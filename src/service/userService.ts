// src/service/userService.ts

import { randomUUID } from "crypto";
import path from "path";
import { type UploadedFile } from "express-fileupload";

import {
  activateUser,
  deactivateUser,
  findUser,
  findUserByEmail,
  findUserByUsername,
  findUsers,
  markUserForDeletion,
  permanentlyDeleteUser,
  restoreDeletedUser,
  setConnectionStatus,
  suspendUser,
  updateAvatar,
  updateEmail,
  updateUsername,
  updateUser,
} from "../repository/user.repository";
import HttpError from "./errorService";
import cloudinary from "../utils/cloudinary";
import { revokeAllUserRefreshTokens } from "../repository/refresh-token.repository";
import { revokeAllUserSessions } from "../repository/session.repository";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UserService {
  static async getAllUsers(next: (error: any) => void) {
    try {
      const users = await findUsers();
      return { success: true, data: users };
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des utilisateurs :",
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

  static async changeUserRole(
    userId: number,
    role: "USER" | "ORGANIZER" | "ADMIN",
    next: (error: any) => void,
  ) {
    try {
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      await updateUser(userId, { role });
      const updatedUser = await findUser(userId);
      if (!updatedUser) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      return { success: true, data: UserService.sanitizeUser(updatedUser) };
    } catch (error) {
      console.error(
        "Erreur lors de la modification du rôle de l'utilisateur :",
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

  static async getUserById(userId: number, next: (error: any) => void) {
    try {
      const user = await findUser(userId);
      if (!user) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      return { success: true, data: UserService.sanitizeUser(user) };
    } catch (error) {
      console.error(
        "Erreur lors de la récupération de l'utilisateur :",
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

  static async changeUserEmail(
    userId: number,
    email: string,
    next: (error: any) => void,
  ) {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalizedEmail)) {
        return next(new HttpError("Format d'email invalide.", 422, false));
      }
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      const existingUser = await findUserByEmail(normalizedEmail);
      if (existingUser && existingUser.id !== userId) {
        return next(new HttpError("Cet email est déjà utilisé.", 409, false));
      }

      await updateEmail(userId, normalizedEmail);
      const updatedUser = await findUser(userId);
      if (!updatedUser) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      return { success: true, data: UserService.sanitizeUser(updatedUser) };
    } catch (error) {
      console.error(
        "Erreur lors de la modification de l'email :",
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

  static async changeUsername(
    userId: number,
    username: string,
    next: (error: any) => void,
  ) {
    try {
      const normalizedUsername = username.trim();
      if (!normalizedUsername) {
        return next(
          new HttpError("Le nom d'utilisateur est requis.", 422, false),
        );
      }
      const user = await findUser(userId);
      if (!user || user.deletedAt !== null) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      const existingUser = await findUserByUsername(normalizedUsername);
      if (existingUser && existingUser.id !== userId) {
        return next(
          new HttpError("Ce nom d'utilisateur est déjà utilisé.", 409, false),
        );
      }

      await updateUsername(userId, normalizedUsername);
      const updatedUser = await findUser(userId);
      if (!updatedUser) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      return { success: true, data: UserService.sanitizeUser(updatedUser) };
    } catch (error) {
      console.error(
        "Erreur lors de la modification du nom d'utilisateur :",
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

  static async changeUserStatus(
    userId: number,
    newStatus: "ACTIVE" | "INACTIVE" | "SUSPENDED",
    next: (error: any) => void,
  ) {
    try {
      const user = await findUser(userId);
      if (!user) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      if (newStatus === "ACTIVE") {
        await activateUser(userId);
      } else if (newStatus === "SUSPENDED") {
        await suspendUser(userId);
      } else {
        await deactivateUser(userId);
      }
      if (newStatus !== "ACTIVE") {
        await setConnectionStatus(userId, "OFFLINE");
        await revokeAllUserSessions(userId);
        await revokeAllUserRefreshTokens(userId);
      }
      const updatedUser = await findUser(userId);
      if (!updatedUser) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      return { success: true, data: UserService.sanitizeUser(updatedUser) };
    } catch (error) {
      console.error(
        "Erreur lors de la modification du statut de l'utilisateur :",
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

  static async changeUserAvatar(
    userId: number,
    newAvatarUrl: UploadedFile,
    next: (error: any) => void,
  ) {
    try {
      const user = await findUser(userId);
      if (!user) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      // Mettre à jour l'avatar de l'utilisateur dans la base de données
      // Implémenter la logique de mise à jour de l'avatar ici
      if (!newAvatarUrl) {
        return next(new HttpError("URL de l'avatar manquante.", 400, false));
      }

      // ✅ Vérifie la taille du fichier (ici, max 500 ko)
      if (newAvatarUrl.size > 5 * 1024 * 1024) {
        // 5MB
        return next(
          new HttpError(
            "La taille de l'avatar dépasse la limite autorisée de 5MB.",
            400,
            false,
          ),
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
        return next(
          new HttpError("Couldn't upload image to cloudinary", 422, false),
        );
      }

      // ✅ Met à jour le champ "profilePhoto" de l'utilisateur connecté
      //    avec l'URL sécurisée retournée par Cloudinary
      await updateAvatar(userId, result.secure_url);
      const updatedUser = await findUser(userId);
      if (!updatedUser) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      return {
        success: true,
        message: "Photo de profile mise à jour !",
        data: UserService.sanitizeUser(updatedUser),
      };
    } catch (error) {
      console.error(
        "Erreur lors de la modification de l'avatar de l'utilisateur :",
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

  static async markUserForDeletion(userId: number, next: (error: any) => void) {
    try {
      const user = await findUser(userId);
      if (!user) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      await markUserForDeletion(userId);
      await setConnectionStatus(userId, "OFFLINE");
      await revokeAllUserSessions(userId);
      await revokeAllUserRefreshTokens(userId);
      return { success: true, message: "Utilisateur marqué pour suppression." };
    } catch (error) {
      console.error(
        "Erreur lors de la suppression de l'utilisateur :",
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

  static async restoreDeletedUser(userId: number, next: (error: any) => void) {
    try {
      const user = await findUser(userId);
      if (!user) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
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
      console.error(
        "Erreur lors de la restauration de l'utilisateur :",
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

  static async permanentlyDeleteUser(
    userId: number,
    next: (error: any) => void,
  ) {
    try {
      const user = await findUser(userId);
      if (!user) {
        return next(new HttpError("Utilisateur non trouvé.", 404, false));
      }
      await permanentlyDeleteUser(userId);
      return { success: true, message: "Utilisateur supprimé définitivement." };
    } catch (error) {
      console.error(
        "Erreur lors de la suppression définitive de l'utilisateur :",
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
