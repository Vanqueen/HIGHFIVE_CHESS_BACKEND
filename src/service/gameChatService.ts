import { randomUUID } from "node:crypto";
import { createGameMessage, findGameMessages } from "../repository/game-chat.repository";
import { epochMilliseconds } from "../utils/temporalDate.ts";
import { GameService } from "./gameService";
import HttpError, { rethrowServiceError } from "./errorService";

const MAX_VISIBLE_MESSAGES = 50;
const MAX_GUEST_MESSAGES_PER_GAME = 50;
const GUEST_MESSAGE_RETENTION_MS = 12 * 60 * 60 * 1000;

export interface GuestGameMessage {
  id: string;
  gameId: number;
  senderId: null;
  senderParticipantId: number;
  senderType: "GUEST";
  senderName: string;
  content: string;
  messageType: "TEXT";
  createdAt: Date;
}

const guestMessagesByGame = new Map<number, GuestGameMessage[]>();

function pruneGuestMessages(now = Date.now()) {
  for (const [gameId, messages] of guestMessagesByGame) {
    const retained = messages.filter(
      (message) => now - epochMilliseconds(message.createdAt) < GUEST_MESSAGE_RETENTION_MS,
    );
    if (retained.length) guestMessagesByGame.set(gameId, retained);
    else guestMessagesByGame.delete(gameId);
  }
}

function combineMessages(
  persistedMessages: Awaited<ReturnType<typeof findGameMessages>>,
  guestMessages: GuestGameMessage[],
) {
  return [...persistedMessages, ...guestMessages]
    .sort((left, right) =>
      epochMilliseconds(left.createdAt) - epochMilliseconds(right.createdAt)
    )
    .slice(-MAX_VISIBLE_MESSAGES);
}

export class GameChatService {
  static async getMessages(gameId: number, userId: number) {
    try {
      await GameService.getGameForUser(gameId, userId);
      pruneGuestMessages();
      return combineMessages(
        await findGameMessages(gameId),
        guestMessagesByGame.get(gameId) ?? [],
      );
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération du chat de la partie :");
    }
  }

  static async getMessagesForGuest(gameId: number, participantId: number) {
    try {
      await GameService.getGameForGuest(gameId, participantId);
      pruneGuestMessages();
      return combineMessages(
        await findGameMessages(gameId),
        guestMessagesByGame.get(gameId) ?? [],
      );
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération du chat invité :");
    }
  }

  static async sendMessage(gameId: number, userId: number, content: string) {
    try {
      const normalizedContent = content.trim();
      if (!normalizedContent || normalizedContent.length > 2000) {
        throw new HttpError("Le message doit contenir entre 1 et 2000 caractères.", 422, false);
      }
      await GameService.getGameForUser(gameId, userId);
      const message = await createGameMessage(gameId, userId, normalizedContent);
      if (!message) {
        throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      }
      return message;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'envoi du message :");
    }
  }

  static async sendMessageAsGuest(gameId: number, participantId: number, content: string) {
    try {
      const normalizedContent = content.trim();
      if (!normalizedContent || normalizedContent.length > 2000) {
        throw new HttpError("Le message doit contenir entre 1 et 2000 caractères.", 422, false);
      }
      const { participants } = await GameService.getGameForGuest(gameId, participantId);
      const participant = participants.find((row) =>
        row.id === participantId && row.participantType === "GUEST" && row.userId === null
      );
      if (!participant) throw new HttpError("Vous ne participez pas à cette partie.", 403, false);

      // The Message model requires a user sender, so guest messages are kept in a bounded,
      // short-lived process cache and are never attributed to an unrelated account.
      pruneGuestMessages();
      const messages = guestMessagesByGame.get(gameId) ?? [];
      const message: GuestGameMessage = {
        id: randomUUID(),
        gameId,
        senderId: null,
        senderParticipantId: participant.id,
        senderType: "GUEST",
        senderName: `Invité ${participant.color === "WHITE" ? "blanc" : "noir"}`,
        content: normalizedContent,
        messageType: "TEXT",
        createdAt: new Date(),
      };
      messages.push(message);
      guestMessagesByGame.set(gameId, messages.slice(-MAX_GUEST_MESSAGES_PER_GAME));
      return message;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'envoi du message invité :");
    }
  }
}
