import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { CONNECTION_EVENTS } from "../events/connection.events";
import { publishGameBroadcast } from "../events/game.broadcast";
import { GAME_ACTIONS, GAME_EVENTS } from "../events/game.events";
import { GAME_CHAT_EVENTS } from "../events/gameChat.events";
import { MATCHMAKING_EVENTS } from "../events/matchmaking.events";
import { MOVE_EVENTS } from "../events/move.events";
import { publishNotification } from "../events/notification.broadcast";
import { getMessageEvents, PRIVATE_MESSAGE_EVENTS } from "../events/message.events";
import { Temporal } from "temporal-polyfill";

const mocks = vi.hoisted(() => ({
  authenticateAccessToken: vi.fn(),
  authenticateGuestSession: vi.fn(),
  getClock: vi.fn(),
  getConversationInfo: vi.fn(),
  getGameForGuest: vi.fn(),
  getGameForUser: vi.fn(),
  getMessages: vi.fn(),
  getMessagesForGuest: vi.fn(),
  getMovesForGuest: vi.fn(),
  getMoves: vi.fn(),
  offerDrawAsParticipant: vi.fn(),
  sendMessageAsGuest: vi.fn(),
  markConversationRead: vi.fn(),
  matchmakingCancel: vi.fn(),
  matchmakingPair: vi.fn(),
  sendPrivateMessage: vi.fn(),
  playMoveAsParticipant: vi.fn(),
  setOffline: vi.fn(),
  setOnline: vi.fn(),
  startWhenReady: vi.fn(),
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
vi.mock("../service/messageService", () => ({
  MessageService: {
    getConversationInfo: mocks.getConversationInfo,
    markAsRead: mocks.markConversationRead,
    sendMessage: mocks.sendPrivateMessage,
  },
}));
vi.mock("../service/userPresenceService", () => ({
  UserPresenceService: {
    setOffline: mocks.setOffline,
    setOnline: mocks.setOnline,
  },
}));
vi.mock("../service/matchmakingService", () => ({
  MatchmakingService: {
    cancelQueueGame: mocks.matchmakingCancel,
    pair: mocks.matchmakingPair,
  },
}));

import { attachGameGateway } from "./game.gateway";

const game = {
  id: 41,
  type: "ONLINE",
  status: "WAITING",
  isRated: false,
  challengeId: null,
  tournamentRoundId: null,
  initialTimeSeconds: 300,
  incrementSeconds: 0,
  activeColor: null,
  whiteTimeRemainingMs: 60_000n,
  blackTimeRemainingMs: 60_000n,
};

let client: Socket | undefined;
let secondClient: Socket | undefined;
let closeGateway: (() => Promise<void>) | undefined;

afterEach(async () => {
  client?.close();
  client = undefined;
  secondClient?.close();
  secondClient = undefined;
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
    const notification = new Promise<unknown>((resolve) =>
      client?.once(CONNECTION_EVENTS.NOTIFICATION, resolve)
    );
    publishNotification({
      id: 92,
      userId: 7,
      guestParticipantId: null,
      type: "GAME_FINISHED",
      title: "Partie terminée",
      content: "La partie est terminée.",
      data: { gameId: 41 },
      createdAt: Temporal.Instant.fromEpochMilliseconds(Date.now()),
    });
    await expect(notification).resolves.toMatchObject({
      id: 92,
      userId: 7,
      type: "GAME_FINISHED",
    });
    expect(mocks.authenticateAccessToken).toHaveBeenCalledWith("test-access-token");
    expect(mocks.setOnline).toHaveBeenCalledWith(7);
    expect(mocks.getGameForUser).toHaveBeenCalledWith(41, 7);
  });

  it("authorizes private conversation rooms and relays private messages", async () => {
    mocks.authenticateAccessToken.mockResolvedValue({
      id: 7,
      email: "player@example.test",
      role: "USER",
      sessionId: 9,
    });
    mocks.setOnline.mockResolvedValue(true);
    mocks.getConversationInfo.mockResolvedValue({ conversation: { id: 25 } });
    mocks.markConversationRead.mockResolvedValue({ conversationId: 25 });
    const message = {
      id: 91,
      conversationId: 25,
      senderId: 7,
      content: "Bonjour",
    };
    mocks.sendPrivateMessage.mockImplementation(async () => {
      getMessageEvents().emitNewMessage(25, message);
      return message;
    });

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

    const joined = new Promise<{ success: boolean }>((resolve) => {
      client?.emit(PRIVATE_MESSAGE_EVENTS.JOIN, { conversationId: 25 }, resolve);
    });
    await expect(joined).resolves.toMatchObject({ success: true });
    expect(mocks.getConversationInfo).toHaveBeenCalledWith(25, 7);
    expect(mocks.markConversationRead).toHaveBeenCalledWith(25, 7);

    const receivedMessage = new Promise<{
      message: { id: number; content: string };
    }>((resolve) => client?.once(PRIVATE_MESSAGE_EVENTS.NEW_MESSAGE, resolve));
    const sent = new Promise<{ success: boolean; data: typeof message }>((resolve) => {
      client?.emit(
        PRIVATE_MESSAGE_EVENTS.SEND,
        { conversationId: 25, content: "Bonjour" },
        resolve,
      );
    });
    await expect(sent).resolves.toMatchObject({ success: true, data: message });
    await expect(receivedMessage).resolves.toMatchObject({ message });

    mocks.getConversationInfo.mockRejectedValueOnce(
      Object.assign(new Error("Vous ne participez pas à cette conversation."), {
        statusCode: 403,
      }),
    );
    const deniedJoin = new Promise<{ success: boolean; error: string }>((resolve) => {
      client?.emit(PRIVATE_MESSAGE_EVENTS.JOIN, { conversationId: 26 }, resolve);
    });
    await expect(deniedJoin).resolves.toMatchObject({
      success: false,
      error: "Vous ne participez pas à cette conversation.",
    });
  }, 15_000);

  it("pairs connected users and sends each player their randomly assigned color", async () => {
    mocks.authenticateAccessToken.mockImplementation(async (token: string) => ({
      id: token === "first-token" ? 7 : 8,
      email: `${token}@example.test`,
      role: "USER",
      sessionId: token === "first-token" ? 9 : 10,
    }));
    mocks.setOnline.mockResolvedValue(true);
    mocks.getGameForUser.mockImplementation(async (gameId: number, userId: number) => ({
      game: {
        ...game,
        id: gameId,
        initialTimeSeconds: 300,
        incrementSeconds: 5,
        challengeId: null,
      },
      participants: [{
        id: gameId * 10,
        userId,
        participantType: "USER",
        color: "WHITE",
      }],
    }));
    mocks.matchmakingPair.mockResolvedValue({
      game: { ...game, id: 10 },
      participants: [
        { id: 10, userId: 7, participantType: "USER", color: "BLACK" },
        { id: 20, userId: 8, participantType: "USER", color: "WHITE" },
      ],
      guestSessionTokens: {},
    });

    const httpServer = createServer();
    const ioServer = attachGameGateway(httpServer);
    closeGateway = () => new Promise((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Adresse HTTP indisponible.");

    const firstFound = new Promise<unknown>((resolve) => {
      client = createClient(`http://127.0.0.1:${address.port}`, {
        auth: { accessToken: "first-token" },
        forceNew: true,
        reconnection: false,
      });
      client.once(MATCHMAKING_EVENTS.FOUND, resolve);
    });
    await new Promise<void>((resolve, reject) => {
      client?.once("connect", resolve);
      client?.once("connect_error", reject);
    });
    const firstAcknowledgement = new Promise<{ success: boolean }>((resolve) => {
      client?.emit(MATCHMAKING_EVENTS.JOIN, { gameId: 1 }, resolve);
    });
    await expect(firstAcknowledgement).resolves.toMatchObject({
      success: true,
      data: { status: "searching" },
    });

    const secondFound = new Promise<unknown>((resolve) => {
      secondClient = createClient(`http://127.0.0.1:${address.port}`, {
        auth: { accessToken: "second-token" },
        forceNew: true,
        reconnection: false,
      });
      secondClient.once(MATCHMAKING_EVENTS.FOUND, resolve);
    });
    await new Promise<void>((resolve, reject) => {
      secondClient?.once("connect", resolve);
      secondClient?.once("connect_error", reject);
    });
    const secondAcknowledgement = new Promise<{ success: boolean }>((resolve) => {
      secondClient?.emit(MATCHMAKING_EVENTS.JOIN, { gameId: 2 }, resolve);
    });
    await expect(secondAcknowledgement).resolves.toMatchObject({
      success: true,
      data: { status: "matched", gameId: 10 },
    });
    await expect(firstFound).resolves.toMatchObject({
      game: { id: 10 },
      participant: { id: 10, color: "BLACK" },
    });
    await expect(secondFound).resolves.toMatchObject({
      game: { id: 10 },
      participant: { id: 20, color: "WHITE" },
    });
    expect(mocks.matchmakingPair).toHaveBeenCalledWith(1, 2, 8);
  }, 15_000);

  it("marks a waiting game ready without starting its clock", async () => {
    mocks.authenticateAccessToken.mockImplementation(async (token: string) => ({
      id: token === "first-token" ? 7 : 8,
      email: `${token}@example.test`,
      role: "USER",
      sessionId: token === "first-token" ? 9 : 10,
    }));
    mocks.setOnline.mockResolvedValue(true);
    mocks.getGameForUser.mockImplementation(async () => ({
      game,
      participants: [
        { id: 71, userId: 7, participantType: "USER", color: "WHITE" },
        { id: 72, userId: 8, participantType: "USER", color: "BLACK" },
      ],
    }));
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
      auth: { accessToken: "first-token" },
      forceNew: true,
      reconnection: false,
    });
    secondClient = createClient(`http://127.0.0.1:${address.port}`, {
      auth: { accessToken: "second-token" },
      forceNew: true,
      reconnection: false,
    });
    await Promise.all([client, secondClient].map((connectedClient) =>
      new Promise<void>((resolve, reject) => {
        connectedClient.once("connect", resolve);
        connectedClient.once("connect_error", reject);
      })
    ));

    const firstReady = new Promise<unknown>((resolve) => {
      client?.once(GAME_EVENTS.READY, resolve);
    });
    const secondReady = new Promise<unknown>((resolve) => {
      secondClient?.once(GAME_EVENTS.READY, resolve);
    });
    const join = (connectedClient: Socket | undefined) =>
      new Promise<{ success: boolean }>((resolve) => {
        connectedClient?.emit(CONNECTION_EVENTS.JOIN_GAME, { gameId: 41 }, resolve);
      });
    const acknowledgements = await Promise.all([join(client), join(secondClient)]);

    expect(acknowledgements).toEqual([
      expect.objectContaining({ success: true }),
      expect.objectContaining({ success: true }),
    ]);
    await expect(firstReady).resolves.toEqual({ gameId: 41 });
    await expect(secondReady).resolves.toEqual({ gameId: 41 });
    expect(mocks.startWhenReady).not.toHaveBeenCalled();
  }, 15_000);

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
    mocks.getClock.mockResolvedValue({
      game,
      whiteTimeRemainingMs: "60000",
      blackTimeRemainingMs: "60000",
      expired: false,
    });
    mocks.getMovesForGuest.mockResolvedValue([]);
    mocks.playMoveAsParticipant.mockResolvedValue({
      game: { ...game, status: "IN_PROGRESS", activeColor: "BLACK" },
      move: { id: 61 },
    });
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

    const guestNotification = new Promise<unknown>((resolve) => {
      client?.once(CONNECTION_EVENTS.NOTIFICATION, resolve);
    });
    publishNotification({
      id: 91,
      userId: null,
      guestParticipantId: 51,
      type: "GAME_FINISHED",
      title: "Partie terminée",
      content: "La partie est terminée.",
      data: { gameId: 41 },
      createdAt: Temporal.Instant.fromEpochMilliseconds(Date.now()),
    });
    await expect(guestNotification).resolves.toMatchObject({
      id: 91,
      guestParticipantId: 51,
      type: "GAME_FINISHED",
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });

    const playedMove = new Promise<unknown>((resolve) => {
      client?.once(MOVE_EVENTS.PLAYED, resolve);
    });
    const moveAcknowledgement = new Promise<{ success: boolean }>((resolve) => {
      client?.emit(MOVE_EVENTS.PLAY, { gameId: 41, from: "e2", to: "e4" }, resolve);
    });
    await expect(moveAcknowledgement).resolves.toMatchObject({ success: true });
    await expect(playedMove).resolves.toMatchObject({
      game: { id: 41, status: "IN_PROGRESS" },
      move: { id: 61 },
    });
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
