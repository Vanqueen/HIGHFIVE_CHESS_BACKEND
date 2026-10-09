import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { CONNECTION_EVENTS } from "../events/connection.events";
import { publishGameBroadcast } from "../events/game.broadcast";
import { GAME_ACTIONS, GAME_EVENTS } from "../events/game.events";

const mocks = vi.hoisted(() => ({
  authenticateAccessToken: vi.fn(),
  getClock: vi.fn(),
  getGameForUser: vi.fn(),
  getMessages: vi.fn(),
  getMoves: vi.fn(),
  setOffline: vi.fn(),
  setOnline: vi.fn(),
  startWhenReady: vi.fn(),
}));

vi.mock("../middlewares/auth.middleware", () => ({
  authenticateAccessToken: mocks.authenticateAccessToken,
}));
vi.mock("../service/gameService", () => ({
  GameService: {
    getClock: mocks.getClock,
    getGameForUser: mocks.getGameForUser,
    startWhenReady: mocks.startWhenReady,
  },
}));
vi.mock("../service/moveService", () => ({
  MoveService: { getMoves: mocks.getMoves },
}));
vi.mock("../service/gameChatService", () => ({
  GameChatService: { getMessages: mocks.getMessages },
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
    mocks.getGameForUser.mockResolvedValue({ game });
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
});
