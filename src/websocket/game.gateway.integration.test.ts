import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { CONNECTION_EVENTS } from "../events/connection.events";
import { publishGameBroadcast } from "../events/game.broadcast";
import { GAME_ACTIONS, GAME_EVENTS } from "../events/game.events";
import { GAME_CHAT_EVENTS } from "../events/gameChat.events";
import { MOVE_EVENTS } from "../events/move.events";

const mocks = vi.hoisted(() => ({
  authenticateAccessToken: vi.fn(),
  authenticateGuestSession: vi.fn(),
  getClock: vi.fn(),
  getGameForGuest: vi.fn(),
  getGameForUser: vi.fn(),
  getMessages: vi.fn(),
  getMessagesForGuest: vi.fn(),
  getMovesForGuest: vi.fn(),
  getMoves: vi.fn(),
  offerDrawAsParticipant: vi.fn(),
  sendMessageAsGuest: vi.fn(),
  playMoveAsParticipant: vi.fn(),
  setOffline: vi.fn(),
  setOnline: vi.fn(),
  startWhenReady: vi.fn(),
  startWhenParticipantsReady: vi.fn(),
  verifyGuestGameToken: vi.fn(),
}));

vi.mock("../middlewares/auth.middleware", () => ({
  authenticateAccessToken: mocks.authenticateAccessToken,
}));
vi.mock("../service/gameService", () => ({
  GameService: {
    getClock: mocks.getClock,
    getGameForGuest: mocks.getGameForGuest,
    getGameForUser: mocks.getGameForUser,
    startWhenReady: mocks.startWhenReady,
    startWhenParticipantsReady: mocks.startWhenParticipantsReady,
    offerDrawAsParticipant: mocks.offerDrawAsParticipant,
  },
}));
vi.mock("../service/moveService", () => ({
  MoveService: {
    getMoves: mocks.getMoves,
    getMovesForGuest: mocks.getMovesForGuest,
    playMoveAsParticipant: mocks.playMoveAsParticipant,
  },
}));
vi.mock("../service/anonymousGameService", () => ({
  AnonymousGameService: {
    authenticateGuestSession: mocks.authenticateGuestSession,
  },
}));
vi.mock("../utils/guestGameToken", () => ({
  verifyGuestGameToken: mocks.verifyGuestGameToken,
}));
vi.mock("../service/gameChatService", () => ({
  GameChatService: {
    getMessages: mocks.getMessages,
    getMessagesForGuest: mocks.getMessagesForGuest,
    sendMessageAsGuest: mocks.sendMessageAsGuest,
  },
}));
vi.mock("../service/userPresenceService", () => ({
  UserPresenceService: {
    setOffline: mocks.setOffline,
    setOnline: mocks.setOnline,
  },
}));

import { attachGameGateway } from "./game.gateway";

const game = {
  id: 41,
  status: "WAITING",
  activeColor: null,
  whiteTimeRemainingMs: 60_000n,
  blackTimeRemainingMs: 60_000n,
};

let client: Socket | undefined;
let closeGateway: (() => Promise<void>) | undefined;

afterEach(async () => {
  client?.close();
  client = undefined;
  await closeGateway?.();
  closeGateway = undefined;
  vi.clearAllMocks();
});

describe("game gateway integration", () => {
  it("authenticates, joins a game room and sends the game state", async () => {
    mocks.authenticateAccessToken.mockResolvedValue({
      id: 7,
      email: "player@example.test",
      role: "USER",
      sessionId: 9,
    });
    mocks.setOnline.mockResolvedValue(true);
    mocks.startWhenReady.mockResolvedValue({ started: false, game });
    mocks.startWhenParticipantsReady.mockResolvedValue({ started: false, game });
    mocks.getGameForUser.mockResolvedValue({
      game,
      participants: [{ id: 71, userId: 7, participantType: "USER" }],
    });
    mocks.getClock.mockResolvedValue({
      game,
      whiteTimeRemainingMs: "60000",
      blackTimeRemainingMs: "60000",
      expired: false,
    });
    mocks.getMoves.mockResolvedValue([]);
    mocks.getMessages.mockResolvedValue([]);

    const httpServer = createServer();
    const ioServer = attachGameGateway(httpServer);
    closeGateway = () => new Promise((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Adresse HTTP indisponible.");

    client = createClient(`http://127.0.0.1:${address.port}`, {
      auth: { accessToken: "test-access-token" },
      forceNew: true,
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      client?.once("connect", resolve);
      client?.once("connect_error", reject);
    });

    const state = new Promise<unknown>((resolve) => client?.once(GAME_EVENTS.STATE, resolve));
    const acknowledgement = new Promise<{ success: boolean }>((resolve) => {
      client?.emit(CONNECTION_EVENTS.JOIN_GAME, { gameId: 41 }, resolve);
    });

    await expect(acknowledgement).resolves.toEqual({
      success: true,
      data: { gameId: 41 },
    });
    await expect(state).resolves.toMatchObject({
      game: {
        id: 41,
        whiteTimeRemainingMs: "60000",
        blackTimeRemainingMs: "60000",
      },
      moves: [],
      messages: [],
    });
    const update = new Promise<unknown>((resolve) => client?.once(GAME_EVENTS.UPDATED, resolve));
    publishGameBroadcast({
      type: "updated",
      gameId: 41,
      action: GAME_ACTIONS.DRAW_OFFERED,
      result: { game: { id: 41, blackTimeRemainingMs: 60_000n } },
    });
    await expect(update).resolves.toEqual({
      action: GAME_ACTIONS.DRAW_OFFERED,
      result: { game: { id: 41, blackTimeRemainingMs: "60000" } },
    });
    expect(mocks.authenticateAccessToken).toHaveBeenCalledWith("test-access-token");
    expect(mocks.setOnline).toHaveBeenCalledWith(7);
    expect(mocks.getGameForUser).toHaveBeenCalledWith(41, 7);
  });

  it("lets a guest join only its assigned game without creating user presence", async () => {
    mocks.verifyGuestGameToken.mockReturnValue({
      kind: "guest-session",
      gameId: 41,
      participantId: 51,
    });
    mocks.authenticateGuestSession.mockResolvedValue({ id: 51 });
    mocks.getGameForGuest.mockResolvedValue({
      game: { ...game, status: "IN_PROGRESS", activeColor: "WHITE" },
      participants: [
        { id: 51, userId: null, participantType: "GUEST", color: "WHITE" },
        { id: 52, userId: null, participantType: "GUEST", color: "BLACK" },
      ],
    });
    mocks.startWhenParticipantsReady.mockResolvedValue({ started: false, game });
    mocks.getClock.mockResolvedValue({
      game,
      whiteTimeRemainingMs: "60000",
      blackTimeRemainingMs: "60000",
      expired: false,
    });
    mocks.getMovesForGuest.mockResolvedValue([]);
    mocks.playMoveAsParticipant.mockResolvedValue({ move: { id: 61 } });
    mocks.getMessagesForGuest.mockResolvedValue([]);
    mocks.sendMessageAsGuest.mockResolvedValue({
      id: "guest-41-51-1",
      gameId: 41,
      senderId: null,
      senderParticipantId: 51,
      senderType: "GUEST",
      senderName: "Invité blanc",
      content: "Bonjour",
      messageType: "TEXT",
      createdAt: new Date(),
    });

    const httpServer = createServer();
    const ioServer = attachGameGateway(httpServer);
    closeGateway = () => new Promise((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Adresse HTTP indisponible.");

    client = createClient(`http://127.0.0.1:${address.port}`, {
      auth: { guestSessionToken: "guest-session-token" },
      forceNew: true,
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      client?.once("connect", resolve);
      client?.once("connect_error", reject);
    });
    const state = new Promise<unknown>((resolve) => client?.once(GAME_EVENTS.STATE, resolve));
    const acknowledgement = new Promise<{ success: boolean }>((resolve) => {
      client?.emit(CONNECTION_EVENTS.JOIN_GAME, { gameId: 41 }, resolve);
    });

    await expect(acknowledgement).resolves.toMatchObject({ success: true });
    await expect(state).resolves.toMatchObject({ moves: [], messages: [] });
    expect(mocks.getGameForGuest).toHaveBeenCalledWith(41, 51);
    expect(mocks.getMovesForGuest).toHaveBeenCalledWith(41, 51);
    expect(mocks.getMessages).not.toHaveBeenCalled();
    expect(mocks.setOnline).not.toHaveBeenCalled();
    expect(mocks.startWhenParticipantsReady).toHaveBeenCalledWith(41, 51, new Set([51]));

    const moveAcknowledgement = new Promise<{ success: boolean }>((resolve) => {
      client?.emit(MOVE_EVENTS.PLAY, { gameId: 41, from: "e2", to: "e4" }, resolve);
    });
    await expect(moveAcknowledgement).resolves.toMatchObject({ success: true });
    expect(mocks.playMoveAsParticipant).toHaveBeenCalledWith(41, 51, {
      from: "e2",
      to: "e4",
    });

    const chatEvent = new Promise<unknown>((resolve) => {
      client?.once(GAME_CHAT_EVENTS.MESSAGE, resolve);
    });
    const chatAcknowledgement = new Promise<{ success: boolean }>((resolve) => {
      client?.emit(GAME_CHAT_EVENTS.SEND_MESSAGE, { gameId: 41, content: "Bonjour" }, resolve);
    });
    await expect(chatAcknowledgement).resolves.toMatchObject({ success: true });
    await expect(chatEvent).resolves.toMatchObject({
      senderType: "GUEST",
      senderParticipantId: 51,
      content: "Bonjour",
    });
    expect(mocks.sendMessageAsGuest).toHaveBeenCalledWith(41, 51, "Bonjour");

    mocks.offerDrawAsParticipant.mockResolvedValue({
      game: { ...game, status: "IN_PROGRESS" },
      offeredBy: 51,
    });
    const drawAcknowledgement = new Promise<{ success: boolean }>((resolve) => {
      client?.emit(GAME_EVENTS.OFFER_DRAW, { gameId: 41 }, resolve);
    });
    await expect(drawAcknowledgement).resolves.toMatchObject({ success: true });
    expect(mocks.offerDrawAsParticipant).toHaveBeenCalledWith(41, 51);
  });
});
