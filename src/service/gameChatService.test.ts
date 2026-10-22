import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGameMessage: vi.fn(),
  findGameMessages: vi.fn(),
  getGameForGuest: vi.fn(),
  getGameForUser: vi.fn(),
}));

vi.mock("../repository/game-chat.repository", () => ({
  createGameMessage: mocks.createGameMessage,
  findGameMessages: mocks.findGameMessages,
}));
vi.mock("./gameService", () => ({
  GameService: {
    getGameForGuest: mocks.getGameForGuest,
    getGameForUser: mocks.getGameForUser,
  },
}));

import { GameChatService } from "./gameChatService";

describe("GameChatService guest chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGameForGuest.mockResolvedValue({
      participants: [
        { id: 25, participantType: "GUEST", userId: null, color: "BLACK" },
      ],
    });
    mocks.findGameMessages.mockResolvedValue([
      {
        id: 8,
        senderId: 4,
        content: "Bonjour",
        messageType: "TEXT",
        createdAt: new Date("2026-10-12T10:00:00.000Z"),
      },
    ]);
  });

  it("accepts a guest message without persisting it under a user id", async () => {
    const sent = await GameChatService.sendMessageAsGuest(41, 25, "  Salut !  ");

    expect(sent).toMatchObject({
      gameId: 41,
      senderId: null,
      senderParticipantId: 25,
      senderType: "GUEST",
      senderName: "Invité noir",
      content: "Salut !",
    });
    expect(sent.createdAt).toBeInstanceOf(Date);
    expect(mocks.createGameMessage).not.toHaveBeenCalled();
  });

  it("returns persisted and in-memory guest messages to a guest participant", async () => {
    await GameChatService.sendMessageAsGuest(42, 25, "Salut !");

    const messages = await GameChatService.getMessagesForGuest(42, 25);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ content: "Bonjour", senderId: 4 });
    expect(messages[1]).toMatchObject({
      content: "Salut !",
      senderType: "GUEST",
      senderParticipantId: 25,
    });
    expect(mocks.getGameForGuest).toHaveBeenCalledWith(42, 25);
  });

  it("rejects blank or overlong guest messages", async () => {
    await expect(GameChatService.sendMessageAsGuest(41, 25, "  "))
      .rejects.toMatchObject({ statusCode: 422 });
    await expect(GameChatService.sendMessageAsGuest(41, 25, "a".repeat(2001)))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});
