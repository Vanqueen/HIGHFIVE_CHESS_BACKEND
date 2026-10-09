import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { getWebSocketConfig } from "../config/websocket.config";
import { CONNECTION_EVENTS } from "../events/connection.events";
import { GAME_ACTIONS, GAME_EVENTS } from "../events/game.events";
import { GAME_CHAT_EVENTS } from "../events/gameChat.events";
import { MOVE_EVENTS } from "../events/move.events";
import { authenticateAccessToken } from "../middlewares/auth.middleware";
import { GameService } from "../service/gameService";
import { MoveService } from "../service/moveService";
import { GameChatService } from "../service/gameChatService";

interface ClientToServerEvents {
  [CONNECTION_EVENTS.JOIN_GAME]: (payload: { gameId: number }, acknowledge?: Acknowledge) => void;
  [CONNECTION_EVENTS.LEAVE_GAME]: (payload: { gameId: number }, acknowledge?: Acknowledge) => void;
  [MOVE_EVENTS.PLAY]: (
    payload: {
      gameId: number;
      from: string;
      to: string;
      promotion?: "QUEEN" | "ROOK" | "BISHOP" | "KNIGHT";
    },
    acknowledge?: Acknowledge,
  ) => void;
  [GAME_EVENTS.OFFER_DRAW]: (payload: { gameId: number }, acknowledge?: Acknowledge) => void;
  [GAME_EVENTS.RESPOND_DRAW]: (
    payload: { gameId: number; accept: boolean },
    acknowledge?: Acknowledge,
  ) => void;
  [GAME_EVENTS.REQUEST_UNDO]: (payload: { gameId: number }, acknowledge?: Acknowledge) => void;
  [GAME_EVENTS.RESPOND_UNDO]: (
    payload: { gameId: number; accept: boolean },
    acknowledge?: Acknowledge,
  ) => void;
  [GAME_EVENTS.RESIGN]: (payload: { gameId: number }, acknowledge?: Acknowledge) => void;
  [GAME_CHAT_EVENTS.SEND_MESSAGE]: (
    payload: { gameId: number; content: string },
    acknowledge?: Acknowledge,
  ) => void;
}

type GameSnapshot = Awaited<ReturnType<typeof GameService.getGame>>;
type SerializedGame = Omit<GameSnapshot["game"], "blackTimeRemainingMs" | "whiteTimeRemainingMs"> & {
  blackTimeRemainingMs: string;
  whiteTimeRemainingMs: string;
};
type PersistedMove = Extract<
  Awaited<ReturnType<typeof MoveService.playMove>>,
  { move: unknown }
>["move"];

interface ServerToClientEvents {
  [GAME_EVENTS.STATE]: (payload: Omit<GameSnapshot, "game"> & {
    moves: Awaited<ReturnType<typeof MoveService.getMoves>>;
    messages: Awaited<ReturnType<typeof GameChatService.getMessages>>;
    game: SerializedGame;
  }) => void;
  [CONNECTION_EVENTS.PLAYER_JOINED]: (payload: { userId: number }) => void;
  [CONNECTION_EVENTS.PLAYER_LEFT]: (payload: { userId: number }) => void;
  [MOVE_EVENTS.PLAYED]: (payload: {
    game: SerializedGame;
    move: PersistedMove;
  }) => void;
  [CONNECTION_EVENTS.GAME_ERROR]: (payload: { message: string; statusCode: number }) => void;
  [GAME_EVENTS.UPDATED]: (payload: { action: string; result: unknown }) => void;
  [GAME_CHAT_EVENTS.MESSAGE]: (
    payload: Awaited<ReturnType<typeof GameChatService.sendMessage>>,
  ) => void;
  [GAME_EVENTS.TIMER_UPDATE]: (payload: {
    gameId: number;
    whiteTimeRemainingMs: string;
    blackTimeRemainingMs: string;
    activeColor: "WHITE" | "BLACK" | null;
  }) => void;
}

interface SocketData {
  userId: number;
  email: string;
  role: "USER" | "ORGANIZER" | "ADMIN";
  sessionId: number;
  accessToken: string;
  joinedGameIds: Set<number>;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
type Acknowledge = (response: { success: boolean; data?: unknown; error?: string }) => void;

function readPositiveId(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function serializeGame(
  game: GameSnapshot["game"],
) {
  return {
    ...game,
    blackTimeRemainingMs: game.blackTimeRemainingMs.toString(),
    whiteTimeRemainingMs: game.whiteTimeRemainingMs.toString(),
  };
}

function serializePayload(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializePayload);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializePayload(nested)]),
    );
  }
  return value;
}

function readToken(socket: GameSocket) {
  const authToken = socket.handshake.auth.accessToken;
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }
  const header = socket.handshake.headers.authorization;
  if (typeof header === "string") {
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    return match?.[1] ?? null;
  }
  return null;
}

function acknowledgeError(error: unknown, acknowledge?: Acknowledge) {
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
  const message =
    statusCode < 500 && error instanceof Error
      ? error.message
      : "Erreur serveur. Veuillez réessayer plus tard.";

  if (statusCode >= 500) {
    console.error("Erreur WebSocket de jeu :", error);
  }
  acknowledge?.({ success: false, error: message });
  return { message, statusCode };
}

export function attachGameGateway(httpServer: HttpServer) {
  const config = getWebSocketConfig();

  const io = new Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>(
    httpServer,
    {
      cors: config.cors,
      maxHttpBufferSize: config.maxHttpBufferSize,
    },
  );
  const clockIntervals = new Map<number, NodeJS.Timeout>();

  const stopClock = (gameId: number) => {
    const interval = clockIntervals.get(gameId);
    if (interval) clearInterval(interval);
    clockIntervals.delete(gameId);
  };

  const startClock = (gameId: number) => {
    if (clockIntervals.has(gameId)) return;
    const interval = setInterval(() => {
      void GameService.getClock(gameId).then(({
        game,
        whiteTimeRemainingMs,
        blackTimeRemainingMs,
        expired,
      }) => {
        io.to(`game:${gameId}`).emit(GAME_EVENTS.TIMER_UPDATE, {
          gameId,
          whiteTimeRemainingMs,
          blackTimeRemainingMs,
          activeColor: game.activeColor,
        });
        if (expired) {
          io.to(`game:${gameId}`).emit(GAME_EVENTS.UPDATED, {
            action: GAME_ACTIONS.TIMEOUT,
            result: { game: serializeGame(game) },
          });
          stopClock(gameId);
        } else if (game.status === "FINISHED") {
          stopClock(gameId);
        }
      }).catch((error) => {
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof error.statusCode === "number"
            ? error.statusCode
            : 500;
        if (statusCode >= 500) console.error("Erreur de synchronisation d'horloge :", error);
      });
    }, config.clockUpdateIntervalMs);
    interval.unref();
    clockIntervals.set(gameId, interval);
  };

  io.use(async (socket, next) => {
    try {
      const token = readToken(socket as GameSocket);
      if (!token) {
        throw Object.assign(new Error("Authentification requise."), { data: { statusCode: 401 } });
      }
      const user = await authenticateAccessToken(token);
      socket.data.userId = user.id;
      socket.data.email = user.email;
      socket.data.role = user.role;
      socket.data.sessionId = user.sessionId;
      socket.data.accessToken = token;
      socket.data.joinedGameIds = new Set();
      next();
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof error.statusCode === "number"
          ? error.statusCode
          : 500;
      if (statusCode >= 500) {
        console.error("Échec de l'authentification WebSocket :", error);
      }
      next(Object.assign(new Error(statusCode === 401 ? "Authentification requise." : "Erreur serveur."), {
        data: { statusCode },
      }));
    }
  });

  io.on("connection", (socket) => {
    const userSocket = socket as GameSocket;
    const sessionCheck = setInterval(() => {
      void authenticateAccessToken(userSocket.data.accessToken).catch(() => {
        userSocket.disconnect(true);
      });
    }, config.sessionValidationIntervalMs);
    sessionCheck.unref();

    userSocket.on(CONNECTION_EVENTS.JOIN_GAME, async (payload, acknowledge) => {
      let gameId: number | null = null;
      try {
        await authenticateAccessToken(userSocket.data.accessToken);
        gameId = readPositiveId(payload?.gameId);
        if (gameId === null) {
          throw Object.assign(new Error("Identifiant de partie invalide."), { statusCode: 422 });
        }
        await userSocket.join(`game:${gameId}`);
        userSocket.data.joinedGameIds.add(gameId);
        const roomSockets = await io.in(`game:${gameId}`).fetchSockets();
        const readiness = await GameService.startWhenReady(
          gameId,
          userSocket.data.userId,
          new Set(roomSockets.map((roomSocket) => roomSocket.data.userId)),
        );
        if (readiness.started) {
          io.to(`game:${gameId}`).emit(GAME_EVENTS.UPDATED, {
            action: GAME_ACTIONS.STARTED,
            result: { game: serializeGame(readiness.game) },
          });
        }
        const state = await GameService.getGameForUser(gameId, userSocket.data.userId);
        const clock = await GameService.getClock(gameId);
        const moves = await MoveService.getMoves(gameId, userSocket.data.userId);
        const messages = await GameChatService.getMessages(gameId, userSocket.data.userId);
        if (clock.expired) {
          io.to(`game:${gameId}`).emit(GAME_EVENTS.UPDATED, {
            action: GAME_ACTIONS.TIMEOUT,
            result: { game: serializeGame(clock.game) },
          });
        } else if (clock.game.status === "IN_PROGRESS") {
          startClock(gameId);
        }
        io.to(`game:${gameId}`).emit(GAME_EVENTS.TIMER_UPDATE, {
          gameId,
          whiteTimeRemainingMs: clock.whiteTimeRemainingMs,
          blackTimeRemainingMs: clock.blackTimeRemainingMs,
          activeColor: clock.game.activeColor,
        });
        userSocket.emit(GAME_EVENTS.STATE, {
          ...state,
          game: serializeGame({
            ...clock.game,
            whiteTimeRemainingMs: BigInt(clock.whiteTimeRemainingMs),
            blackTimeRemainingMs: BigInt(clock.blackTimeRemainingMs),
          }),
          moves,
          messages,
        });
        userSocket.to(`game:${gameId}`).emit(CONNECTION_EVENTS.PLAYER_JOINED, {
          userId: userSocket.data.userId,
        });
        acknowledge?.({ success: true, data: { gameId } });
      } catch (error) {
        const result = acknowledgeError(error, acknowledge);
        userSocket.emit(CONNECTION_EVENTS.GAME_ERROR, result);
      }
    });

    userSocket.on(CONNECTION_EVENTS.LEAVE_GAME, async (payload, acknowledge) => {
      const gameId = readPositiveId(payload?.gameId);
      if (gameId === null || !userSocket.data.joinedGameIds.has(gameId)) {
        acknowledge?.({ success: false, error: "Vous n'êtes pas connecté à cette partie." });
        return;
      }
      await userSocket.leave(`game:${gameId}`);
      userSocket.data.joinedGameIds.delete(gameId);
      userSocket.to(`game:${gameId}`).emit(CONNECTION_EVENTS.PLAYER_LEFT, {
        userId: userSocket.data.userId,
      });
      if (!io.sockets.adapter.rooms.get(`game:${gameId}`)?.size) stopClock(gameId);
      acknowledge?.({ success: true, data: { gameId } });
    });

    userSocket.on(MOVE_EVENTS.PLAY, async (payload, acknowledge) => {
      try {
        await authenticateAccessToken(userSocket.data.accessToken);
        const gameId = readPositiveId(payload?.gameId);
        if (gameId === null) {
          throw Object.assign(new Error("Identifiant de partie invalide."), { statusCode: 422 });
        }
        if (!userSocket.data.joinedGameIds.has(gameId)) {
          throw Object.assign(new Error("Rejoignez la partie avant de jouer."), { statusCode: 403 });
        }
        const gameState = await GameService.getGameForUser(gameId, userSocket.data.userId);
        if (gameState.game.status !== "IN_PROGRESS") {
          throw Object.assign(new Error("La partie attend encore que ses joueurs soient prêts."), {
            statusCode: 409,
          });
        }
        if (typeof payload.from !== "string" || typeof payload.to !== "string") {
          throw Object.assign(new Error("Données de coup invalides."), { statusCode: 422 });
        }
        if (
          payload.promotion !== undefined &&
          payload.promotion !== "QUEEN" &&
          payload.promotion !== "ROOK" &&
          payload.promotion !== "BISHOP" &&
          payload.promotion !== "KNIGHT"
        ) {
          throw Object.assign(new Error("Pièce de promotion invalide."), { statusCode: 422 });
        }

        const result = await MoveService.playMove(gameId, userSocket.data.userId, {
          from: payload.from,
          to: payload.to,
          ...(payload.promotion ? { promotion: payload.promotion } : {}),
        });
        if ("timedOut" in result) {
          const serializedResult = { game: serializeGame(result.game) };
          io.to(`game:${gameId}`).emit(GAME_EVENTS.UPDATED, {
            action: GAME_ACTIONS.TIMEOUT,
            result: serializedResult,
          });
          acknowledge?.({ success: true, data: serializedResult });
          stopClock(gameId);
          return;
        }
        const state = await GameService.getGameForUser(gameId, userSocket.data.userId);
        const serializedResult = {
          game: serializeGame(state.game),
          move: result.move,
        };
        io.to(`game:${gameId}`).emit(MOVE_EVENTS.PLAYED, {
          ...serializedResult,
        });
        if (state.game.status === "FINISHED") stopClock(gameId);
        acknowledge?.({ success: true, data: serializedResult });
      } catch (error) {
        const result = acknowledgeError(error, acknowledge);
        userSocket.emit(CONNECTION_EVENTS.GAME_ERROR, result);
      }
    });

    const executeAction = async (
      rawGameId: unknown,
      action: string,
      operation: (gameId: number) => Promise<unknown>,
      acknowledge?: Acknowledge,
    ) => {
      try {
        await authenticateAccessToken(userSocket.data.accessToken);
        const gameId = readPositiveId(rawGameId);
        if (gameId === null) {
          throw Object.assign(new Error("Identifiant de partie invalide."), { statusCode: 422 });
        }
        if (!userSocket.data.joinedGameIds.has(gameId)) {
          throw Object.assign(new Error("Rejoignez la partie avant cette action."), { statusCode: 403 });
        }
        const result = await operation(gameId);
        const serializedResult = serializePayload(result);
        io.to(`game:${gameId}`).emit(GAME_EVENTS.UPDATED, {
          action,
          result: serializedResult,
        });
        acknowledge?.({ success: true, data: serializedResult });
        const game = result && typeof result === "object" && "game" in result
          ? result.game
          : result;
        if (
          game &&
          typeof game === "object" &&
          "status" in game &&
          game.status === "FINISHED"
        ) {
          stopClock(gameId);
        }
      } catch (error) {
        const response = acknowledgeError(error, acknowledge);
        userSocket.emit(CONNECTION_EVENTS.GAME_ERROR, response);
      }
    };

    userSocket.on(GAME_EVENTS.OFFER_DRAW, (payload, acknowledge) => {
      void executeAction(
        payload?.gameId,
        GAME_ACTIONS.DRAW_OFFERED,
        (gameId) => GameService.offerDraw(gameId, userSocket.data.userId),
        acknowledge,
      );
    });
    userSocket.on(GAME_EVENTS.RESPOND_DRAW, (payload, acknowledge) => {
      if (typeof payload?.accept !== "boolean") {
        acknowledge?.({ success: false, error: "Réponse à l'offre invalide." });
        return;
      }
      void executeAction(
        payload.gameId,
        payload.accept ? GAME_ACTIONS.DRAW_ACCEPTED : GAME_ACTIONS.DRAW_DECLINED,
        (gameId) => GameService.respondToDraw(gameId, userSocket.data.userId, payload.accept),
        acknowledge,
      );
    });
    userSocket.on(GAME_EVENTS.REQUEST_UNDO, (payload, acknowledge) => {
      void executeAction(
        payload?.gameId,
        GAME_ACTIONS.UNDO_REQUESTED,
        (gameId) => GameService.requestUndo(gameId, userSocket.data.userId),
        acknowledge,
      );
    });
    userSocket.on(GAME_EVENTS.RESPOND_UNDO, (payload, acknowledge) => {
      if (typeof payload?.accept !== "boolean") {
        acknowledge?.({ success: false, error: "Réponse à la demande d'annulation invalide." });
        return;
      }
      void executeAction(
        payload.gameId,
        payload.accept ? GAME_ACTIONS.UNDO_ACCEPTED : GAME_ACTIONS.UNDO_DECLINED,
        (gameId) => GameService.respondToUndo(gameId, userSocket.data.userId, payload.accept),
        acknowledge,
      );
    });
    userSocket.on(GAME_EVENTS.RESIGN, (payload, acknowledge) => {
      void executeAction(
        payload?.gameId,
        GAME_ACTIONS.RESIGNED,
        (gameId) => GameService.resign(gameId, userSocket.data.userId),
        acknowledge,
      );
    });
    userSocket.on(GAME_CHAT_EVENTS.SEND_MESSAGE, async (payload, acknowledge) => {
      try {
        await authenticateAccessToken(userSocket.data.accessToken);
        const gameId = readPositiveId(payload?.gameId);
        if (gameId === null) {
          throw Object.assign(new Error("Identifiant de partie invalide."), { statusCode: 422 });
        }
        if (!userSocket.data.joinedGameIds.has(gameId)) {
          throw Object.assign(new Error("Rejoignez la partie avant d'envoyer un message."), {
            statusCode: 403,
          });
        }
        if (typeof payload.content !== "string") {
          throw Object.assign(new Error("Le message doit contenir entre 1 et 2000 caractères."), {
            statusCode: 422,
          });
        }
        const message = await GameChatService.sendMessage(
          gameId,
          userSocket.data.userId,
          payload.content,
        );
        io.to(`game:${gameId}`).emit(GAME_CHAT_EVENTS.MESSAGE, message);
        acknowledge?.({ success: true, data: message });
      } catch (error) {
        const response = acknowledgeError(error, acknowledge);
        userSocket.emit(CONNECTION_EVENTS.GAME_ERROR, response);
      }
    });

    userSocket.on(CONNECTION_EVENTS.DISCONNECTING, () => {
      clearInterval(sessionCheck);
      for (const room of userSocket.rooms) {
        const match = /^game:(\d+)$/.exec(room);
        if (!match) continue;
        const gameId = Number(match[1]);
        userSocket.to(room).emit(CONNECTION_EVENTS.PLAYER_LEFT, {
          userId: userSocket.data.userId,
        });
        userSocket.data.joinedGameIds.delete(gameId);
        setTimeout(() => {
          if (!io.sockets.adapter.rooms.get(room)?.size) stopClock(gameId);
        }, 0);
      }
    });
  });

  return io;
}
