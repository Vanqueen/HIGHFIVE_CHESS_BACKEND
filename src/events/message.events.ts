import { Server } from "socket.io";

export const PRIVATE_MESSAGE_EVENTS = {
  JOIN: "conversation:join",
  LEAVE: "conversation:leave",
  SEND: "message:send",
  TYPING_START: "conversation:typing:start",
  TYPING_STOP: "conversation:typing:stop",
  NEW_MESSAGE: "message:new",
  EDITED: "message:edited",
  DELETED: "message:deleted",
  READ: "conversation:read",
  USER_JOINED: "conversation:user-joined",
  USER_LEFT: "conversation:user-left",
  TYPING: "conversation:typing",
  STOPPED_TYPING: "conversation:stopped-typing",
} as const;

interface Message {
  senderId: number;
}

function serializePayload(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializePayload);
  if (value && typeof value === "object") {
    const epochMilliseconds = Reflect.get(value, "epochMilliseconds");
    if (typeof epochMilliseconds === "number") {
      return new Date(epochMilliseconds).toISOString();
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializePayload(nested)]),
    );
  }
  return value;
}

export interface MessageEventData {
  message: unknown;
  conversationId: number;
  senderId: number;
}

export interface MessageEditedEventData {
  messageId: number;
  conversationId: number;
  newContent: string;
  editedAt: string;
}

export interface MessageDeletedEventData {
  messageId: number;
  conversationId: number;
  deletedAt: string;
}

export interface ConversationReadEventData {
  conversationId: number;
  userId: number;
  lastReadAt: string;
}

export class MessageEvents {
  constructor(private io: Server) {}

  // Événement lorsqu'un nouveau message est envoyé
  emitNewMessage(conversationId: number, message: Message) {
    this.io.to(`conversation:${conversationId}`).emit(PRIVATE_MESSAGE_EVENTS.NEW_MESSAGE, {
      message: serializePayload(message),
      conversationId,
      senderId: message.senderId,
    } satisfies MessageEventData);
  }

  // Événement lorsqu'un message est modifié
  emitMessageEdited(
    conversationId: number,
    messageId: number,
    newContent: string,
    editedAt: Date,
  ) {
    this.io.to(`conversation:${conversationId}`).emit(PRIVATE_MESSAGE_EVENTS.EDITED, {
      messageId,
      conversationId,
      newContent,
      editedAt: editedAt.toISOString(),
    } satisfies MessageEditedEventData);
  }

  // Événement lorsqu'un message est supprimé
  emitMessageDeleted(
    conversationId: number,
    messageId: number,
    deletedAt: Date,
  ) {
    this.io.to(`conversation:${conversationId}`).emit(PRIVATE_MESSAGE_EVENTS.DELETED, {
      messageId,
      conversationId,
      deletedAt: deletedAt.toISOString(),
    } satisfies MessageDeletedEventData);
  }

  // Événement lorsqu'une conversation est marquée comme lue
  emitConversationRead(
    conversationId: number,
    userId: number,
    lastReadAt: Date,
  ) {
    this.io.to(`conversation:${conversationId}`).emit(PRIVATE_MESSAGE_EVENTS.READ, {
      conversationId,
      userId,
      lastReadAt: lastReadAt.toISOString(),
    } satisfies ConversationReadEventData);
  }

  // Événement lorsqu'un utilisateur rejoint une conversation
  emitUserJoinedConversation(
    conversationId: number,
    userId: number,
  ) {
    this.io.to(`conversation:${conversationId}`).emit(PRIVATE_MESSAGE_EVENTS.USER_JOINED, {
      conversationId,
      userId,
      timestamp: new Date(),
    });
  }

  // Événement lorsqu'un utilisateur quitte une conversation
  emitUserLeftConversation(
    conversationId: number,
    userId: number,
  ) {
    this.io.to(`conversation:${conversationId}`).emit(PRIVATE_MESSAGE_EVENTS.USER_LEFT, {
      conversationId,
      userId,
      timestamp: new Date(),
    });
  }

  // Événement lorsqu'un utilisateur tape un message
  emitUserTyping(
    conversationId: number,
    userId: number,
  ) {
    this.io.to(`conversation:${conversationId}`).emit(PRIVATE_MESSAGE_EVENTS.TYPING, {
      conversationId,
      userId,
      timestamp: new Date(),
    });
  }

  // Événement lorsqu'un utilisateur arrête de taper
  emitUserStoppedTyping(
    conversationId: number,
    userId: number,
  ) {
    this.io.to(`conversation:${conversationId}`).emit(PRIVATE_MESSAGE_EVENTS.STOPPED_TYPING, {
      conversationId,
      userId,
      timestamp: new Date(),
    });
  }
}

// Singleton pour partager l'instance des événements de message
let messageEventsInstance: MessageEvents | null = null;

export function getMessageEvents(io?: Server): MessageEvents {
  if (!messageEventsInstance && io) {
    messageEventsInstance = new MessageEvents(io);
  }
  if (!messageEventsInstance) {
    throw new Error("MessageEvents must be initialized with a Socket.IO server first");
  }
  return messageEventsInstance;
}

export function initializeMessageEvents(io: Server): MessageEvents {
  messageEventsInstance = new MessageEvents(io);
  return messageEventsInstance;
}