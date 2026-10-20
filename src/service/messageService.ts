import {
  countUnreadMessages,
  createMessage,
  findMessage,
  findMessagesForConversation,
  updateMessage,
} from "../repository/message.repository";
import {
  findConversation,
  findConversationParticipant,
  findConversationParticipants,
  updateConversation,
} from "../repository/conversation.repository";
import { updateConversationParticipant } from "../repository/conversation-participant.repository";
import { areUsersBlocked } from "../repository/blocked-user.repository";
import { findUser } from "../repository/user.repository";
import HttpError, { rethrowServiceError } from "./errorService";
import { toTemporal } from "../utils/temporalDate.ts";
import { MessageBroadcastService } from "./messageBroadcastService";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_PAGE_SIZE = 100;
const MAX_EDIT_AGE_MS = 24 * 60 * 60 * 1000;

function epochMilliseconds(value: Date) {
  const temporalValue = Reflect.get(value, "epochMilliseconds");
  return typeof temporalValue === "number" ? temporalValue : value.getTime();
}

async function requireConversationAccess(conversationId: number, userId: number) {
  const conversation = await findConversation(conversationId);
  if (!conversation) {
    throw new HttpError("Conversation introuvable.", 404, false);
  }

  const participant = await findConversationParticipant(conversationId, userId);
  if (!participant || participant.leftAt !== null) {
    throw new HttpError("Vous ne participez pas à cette conversation.", 403, false);
  }

  const participants = await findConversationParticipants(conversationId);
  if (conversation.type === "DIRECT") {
    const otherParticipant = participants.find((item) => item.userId !== userId);
    if (otherParticipant && await areUsersBlocked(userId, otherParticipant.userId)) {
      throw new HttpError("Cette interaction n’est pas autorisée.", 403, false);
    }
  }

  return { conversation, participant, participants };
}

function validateMessageContent(content: string) {
  if (typeof content !== "string") {
    throw new HttpError("Le contenu du message doit être du texte.", 422, false);
  }
  const trimmed = content.trim();
  if (!trimmed) {
    throw new HttpError("Le contenu du message ne peut pas être vide.", 422, false);
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new HttpError("Le message ne peut pas dépasser 2000 caractères.", 422, false);
  }
  return trimmed;
}

export class MessageService {
  static async sendMessage(
    conversationId: number,
    senderId: number,
    content: string,
  ) {
    try {
      const normalizedContent = validateMessageContent(content);
      await requireConversationAccess(conversationId, senderId);

      const message = await createMessage({
        conversationId,
        senderId,
        content: normalizedContent,
        messageType: "TEXT",
        createdAt: toTemporal(new Date()),
      });
      await updateConversation(conversationId, { updatedAt: toTemporal(new Date()) });
      await MessageBroadcastService.broadcastNewMessage(conversationId, message);
      return message;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'envoi du message :");
    }
  }

  static async getMessages(
    conversationId: number,
    userId: number,
    limit = 50,
    beforeId?: number,
  ) {
    try {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
        throw new HttpError("La limite doit être comprise entre 1 et 100.", 422, false);
      }
      if (
        beforeId !== undefined &&
        (!Number.isSafeInteger(beforeId) || beforeId <= 0)
      ) {
        throw new HttpError("Curseur de pagination invalide.", 422, false);
      }

      await requireConversationAccess(conversationId, userId);
      if (beforeId !== undefined) {
        const cursorMessage = await findMessage(beforeId);
        if (!cursorMessage || cursorMessage.conversationId !== conversationId) {
          throw new HttpError("Curseur de pagination invalide.", 422, false);
        }
      }

      const messages = await findMessagesForConversation(conversationId, limit, beforeId);
      await this.markAsRead(conversationId, userId);
      return messages;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des messages :");
    }
  }

  static async markAsRead(conversationId: number, userId: number) {
    try {
      const { participant } = await requireConversationAccess(conversationId, userId);
      const lastReadAt = new Date();
      await updateConversationParticipant(participant.id, {
        lastReadAt: toTemporal(lastReadAt),
      });
      await MessageBroadcastService.broadcastConversationRead(
        conversationId,
        userId,
        lastReadAt,
      );
      return { conversationId, userId, lastReadAt };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du marquage de la conversation comme lue :");
    }
  }

  static async editMessage(messageId: number, userId: number, newContent: string) {
    try {
      const normalizedContent = validateMessageContent(newContent);
      const message = await findMessage(messageId);
      if (!message) {
        throw new HttpError("Message introuvable.", 404, false);
      }
      await requireConversationAccess(message.conversationId, userId);
      if (message.senderId !== userId) {
        throw new HttpError("Vous ne pouvez modifier que vos propres messages.", 403, false);
      }
      if (message.messageType !== "TEXT") {
        throw new HttpError("Ce type de message ne peut pas être modifié.", 409, false);
      }
      if (message.deletedAt !== null) {
        throw new HttpError("Impossible de modifier un message supprimé.", 409, false);
      }
      if (Date.now() - epochMilliseconds(message.createdAt) > MAX_EDIT_AGE_MS) {
        throw new HttpError("Le message est trop ancien pour être modifié.", 409, false);
      }

      const editedAt = new Date();
      const updatedMessage = await updateMessage(messageId, {
        content: normalizedContent,
        editedAt: toTemporal(editedAt),
      });
      await updateConversation(message.conversationId, { updatedAt: toTemporal(editedAt) });
      await MessageBroadcastService.broadcastMessageEdited(
        message.conversationId,
        messageId,
        normalizedContent,
        editedAt,
      );
      return updatedMessage;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la modification du message :");
    }
  }

  static async deleteMessage(messageId: number, userId: number) {
    try {
      const message = await findMessage(messageId);
      if (!message) {
        throw new HttpError("Message introuvable.", 404, false);
      }
      await requireConversationAccess(message.conversationId, userId);
      if (message.senderId !== userId) {
        throw new HttpError("Vous ne pouvez supprimer que vos propres messages.", 403, false);
      }
      if (message.messageType !== "TEXT") {
        throw new HttpError("Ce type de message ne peut pas être supprimé.", 409, false);
      }
      if (message.deletedAt !== null) {
        throw new HttpError("Le message est déjà supprimé.", 409, false);
      }

      const deletedAt = new Date();
      const deletedMessage = await updateMessage(messageId, {
        deletedAt: toTemporal(deletedAt),
      });
      await updateConversation(message.conversationId, { updatedAt: toTemporal(deletedAt) });
      await MessageBroadcastService.broadcastMessageDeleted(
        message.conversationId,
        messageId,
        deletedAt,
      );
      return deletedMessage;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la suppression du message :");
    }
  }

  static async getConversationInfo(conversationId: number, userId: number) {
    try {
      const { conversation, participants, participant } =
        await requireConversationAccess(conversationId, userId);
      const users = await Promise.all(participants.map(async (item) => {
        const user = await findUser(item.userId);
        return user ? {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
          connectionStatus: user.connectionStatus,
        } : null;
      }));

      return {
        conversation,
        participants: users.filter((user) => user !== null),
        unreadCount: await countUnreadMessages(
          conversationId,
          userId,
          participant.lastReadAt,
        ),
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des informations de conversation :");
    }
  }
}
