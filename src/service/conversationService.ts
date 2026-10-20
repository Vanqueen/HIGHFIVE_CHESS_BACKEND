import {
  createOrFindDirectConversation,
  findDirectConversationsForUser,
} from "../repository/conversation.repository";
import { areUsersBlocked } from "../repository/blocked-user.repository";
import { findUser } from "../repository/user.repository";
import HttpError, { rethrowServiceError } from "./errorService";

export class ConversationService {
  static async openDirectConversation(userId: number, otherUserId: number) {
    try {
      if (!Number.isSafeInteger(otherUserId) || otherUserId <= 0 || otherUserId === userId) {
        throw new HttpError("Identifiant d’utilisateur invalide.", 422, false);
      }
      const otherUser = await findUser(otherUserId);
      if (!otherUser || otherUser.accountStatus !== "ACTIVE" || otherUser.deletedAt !== null) {
        throw new HttpError("Utilisateur introuvable ou indisponible.", 404, false);
      }
      if (await areUsersBlocked(userId, otherUserId)) {
        throw new HttpError("Cette interaction n’est pas autorisée.", 403, false);
      }
      return await createOrFindDirectConversation(userId, otherUserId);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l’ouverture de la conversation directe :");
    }
  }

  static async getDirectConversations(userId: number) {
    try {
      const rows = await findDirectConversationsForUser(userId);
      const visible = [];
      for (const row of rows) {
        if (await areUsersBlocked(userId, row.otherUserId)) continue;
        const user = await findUser(row.otherUserId);
        if (!user || user.accountStatus !== "ACTIVE" || user.deletedAt !== null) continue;
        visible.push({
          conversationId: row.conversation.id,
          otherUserId: user.id,
          updatedAt: row.conversation.updatedAt,
          otherUser: {
            id: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl,
          },
        });
      }
      return visible;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des conversations directes :");
    }
  }
}
