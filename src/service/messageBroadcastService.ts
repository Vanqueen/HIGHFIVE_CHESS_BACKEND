import { getMessageEvents } from "../events/message.events";

interface Message {
  senderId: number;
}

export class MessageBroadcastService {
  static async broadcastNewMessage(conversationId: number, message: Message) {
    try {
      const messageEvents = getMessageEvents();
      messageEvents.emitNewMessage(conversationId, message);
    } catch (error) {
      console.error("Erreur lors de la diffusion du nouveau message :", error);
    }
  }

  static async broadcastMessageEdited(
    conversationId: number,
    messageId: number,
    newContent: string,
    editedAt: Date,
  ) {
    try {
      const messageEvents = getMessageEvents();
      messageEvents.emitMessageEdited(conversationId, messageId, newContent, editedAt);
    } catch (error) {
      console.error("Erreur lors de la diffusion de la modification du message :", error);
    }
  }

  static async broadcastMessageDeleted(
    conversationId: number,
    messageId: number,
    deletedAt: Date,
  ) {
    try {
      const messageEvents = getMessageEvents();
      messageEvents.emitMessageDeleted(conversationId, messageId, deletedAt);
    } catch (error) {
      console.error("Erreur lors de la diffusion de la suppression du message :", error);
    }
  }

  static async broadcastConversationRead(
    conversationId: number,
    userId: number,
    lastReadAt: Date,
  ) {
    try {
      const messageEvents = getMessageEvents();
      messageEvents.emitConversationRead(conversationId, userId, lastReadAt);
    } catch (error) {
      console.error("Erreur lors de la diffusion du marquage comme lu :", error);
    }
  }

  static async broadcastUserJoinedConversation(
    conversationId: number,
    userId: number,
  ) {
    try {
      const messageEvents = getMessageEvents();
      messageEvents.emitUserJoinedConversation(conversationId, userId);
    } catch (error) {
      console.error("Erreur lors de la diffusion de l'arrivée d'un utilisateur :", error);
    }
  }

  static async broadcastUserLeftConversation(
    conversationId: number,
    userId: number,
  ) {
    try {
      const messageEvents = getMessageEvents();
      messageEvents.emitUserLeftConversation(conversationId, userId);
    } catch (error) {
      console.error("Erreur lors de la diffusion du départ d'un utilisateur :", error);
    }
  }

  static async broadcastUserTyping(
    conversationId: number,
    userId: number,
  ) {
    try {
      const messageEvents = getMessageEvents();
      messageEvents.emitUserTyping(conversationId, userId);
    } catch (error) {
      console.error("Erreur lors de la diffusion de l'indication de frappe :", error);
    }
  }

  static async broadcastUserStoppedTyping(
    conversationId: number,
    userId: number,
  ) {
    try {
      const messageEvents = getMessageEvents();
      messageEvents.emitUserStoppedTyping(conversationId, userId);
    } catch (error) {
      console.error("Erreur lors de la diffusion de l'arrêt de frappe :", error);
    }
  }
}