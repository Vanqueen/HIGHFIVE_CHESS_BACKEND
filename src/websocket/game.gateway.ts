import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { getWebSocketConfig } from "../config/websocket.config";
import { CONNECTION_EVENTS } from "../events/connection.events";
import { GAME_ACTIONS, GAME_EVENTS } from "../events/game.events";
import { GAME_CHAT_EVENTS } from "../events/gameChat.events";
import { MessageBroadcastService } from "../service/messageBroadcastService";
import { subscribeToGameBroadcasts } from "../events/game.broadcast";
import { subscribeToNotifications } from "../events/notification.broadcast";
import { MOVE_EVENTS } from "../events/move.events";
import { initializeMessageEvents, PRIVATE_MESSAGE_EVENTS } from "../events/message.events";
import { authenticateAccessToken } from "../middlewares/auth.middleware";
import { AnonymousGameService } from "../service/anonymousGameService";
import { GameService } from "../service/gameService";
import { MoveService } from "../service/moveService";
import { GameChatService } from "../service/gameChatService";
import { MessageService } from "../service/messageService";
import { UserPresenceService } from "../service/userPresenceService";
import { SocketPresenceRegistry } from "./socket-presence.registry";
import { verifyGuestGameToken } from "../utils/guestGameToken";

interface ClientToServerEvents {
  [PRIVATE_MESSAGE_EVENTS.JOIN]: (
    payload: { conversationId: number },
    acknowledge?: Acknowledge,
  ) => void;
  [PRIVATE_MESSAGE_EVENTS.LEAVE]: (
    payload: { conversationId: number },
    acknowledge?: Acknowledge,
  ) => void;
  [PRIVATE_MESSAGE_EVENTS.SEND]: (
    payload: { conversationId: number; content: string },
    acknowledge?: Acknowledge,
  ) => void;
  [PRIVATE_MESSAGE_EVENTS.TYPING_START]: (
    payload: { conversationId: number },
  ) => void;
  [PRIVATE_MESSAGE_EVENTS.TYPING_STOP]: (
    payload: { conversationId: number },
  ) => void;
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
  [GAME_EVENTS.CLAIM_NO_SHOW]: (
    payload: { gameId: number; outcome: "DRAW" | "CANCEL" | "WIN" },
    acknowledge?: Acknowledge,
  ) => void;
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
type GameChatMessage = Awaited<ReturnType<typeof GameChatService.getMessages>>[number];

interface ServerToClientEvents {
  [PRIVATE_MESSAGE_EVENTS.NEW_MESSAGE]: (payload: unknown) => void;
  [PRIVATE_MESSAGE_EVENTS.EDITED]: (payload: unknown) => void;
  [PRIVATE_MESSAGE_EVENTS.DELETED]: (payload: unknown) => void;
  [PRIVATE_MESSAGE_EVENTS.READ]: (payload: unknown) => void;
  [PRIVATE_MESSAGE_EVENTS.USER_JOINED]: (payload: unknown) => void;
  [PRIVATE_MESSAGE_EVENTS.USER_LEFT]: (payload: unknown) => void;
  [PRIVATE_MESSAGE_EVENTS.TYPING]: (payload: unknown) => void;
  [PRIVATE_MESSAGE_EVENTS.STOPPED_TYPING]: (payload: unknown) => void;
  [GAME_EVENTS.STATE]: (payload: Omit<GameSnapshot, "game"> & {
    moves: Awaited<ReturnType<typeof MoveService.getMoves>>;
    messages: GameChatMessage[];
    game: SerializedGame;
  }) => void;
  [CONNECTION_EVENTS.PLAYER_JOINED]: (payload: { userId?: number; participantId: number }) => void;
  [CONNECTION_EVENTS.PLAYER_LEFT]: (payload: { userId?: number; participantId: number }) => void;
  [CONNECTION_EVENTS.NOTIFICATION]: (payload: unknown) => void;
  [MOVE_EVENTS.PLAYED]: (payload: {
    game: SerializedGame;
    move: PersistedMove;
  }) => void;
  [CONNECTION_EVENTS.GAME_ERROR]: (payload: { message: string; statusCode: number }) => void;
  [GAME_EVENTS.UPDATED]: (payload: { action: string; result: unknown }) => void;
  [GAME_CHAT_EVENTS.MESSAGE]: (
    payload: GameChatMessage,
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
  guestParticipantId: number | null;
  guestGameId: number | null;
  participantId: number | null;
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
  initializeMessageEvents(io);
  const unsubscribeBroadcasts = subscribeToGameBroadcasts((event) => {
    const room = `game:${event.gameId}`;
    if (event.type === "updated") {
      io.to(room).emit(GAME_EVENTS.UPDATED, {
        action: event.action,
        result: serializePayload(event.result),
      });
    } else if (event.type === "move-played") {
      io.to(room).emit(MOVE_EVENTS.PLAYED, serializePayload(event.result) as {
        game: SerializedGame;
        move: PersistedMove;
      });
    } else {
      io.to(room).emit(GAME_CHAT_EVENTS.MESSAGE, serializePayload(event.message) as
        GameChatMessage);
    }
  });
  io.once("close", unsubscribeBroadcasts);
  const unsubscribeNotifications = subscribeToNotifications((notification) => {
    const payload = serializePayload(notification);
    if (notification.userId !== null) {
      io.to(`user:${notification.userId}`).emit(CONNECTION_EVENTS.NOTIFICATION, payload);
    }
    if (notification.guestParticipantId !== null) {
      io.to(`guest:${notification.guestParticipantId}`)
        .emit(CONNECTION_EVENTS.NOTIFICATION, payload);
    }
  });
  io.once("close", unsubscribeNotifications);
  console.info("[websocket] Serveur Socket.IO initialisé.");
  const clockIntervals = new Map<number, NodeJS.Timeout>();
  const userPresence = new SocketPresenceRegistry();
  const presenceWrites = new Map<number, Promise<void>>();

  const synchronizePresence = async (userId: number) => {
    const previousWrite = presenceWrites.get(userId) ?? Promise.resolve();
    const nextWrite = previousWrite.catch(() => undefined).then(async () => {
      const hasConnections = userPresence.hasConnections(userId);
      const updated = hasConnections
        ? await UserPresenceService.setOnline(userId)
        : await UserPresenceService.setOffline(userId);
      if (hasConnections && !updated) {
        throw new Error(`Impossible de marquer l'utilisateur ${userId} comme connecté.`);
      }
    });
    presenceWrites.set(userId, nextWrite);
    return nextWrite.finally(() => {
      if (presenceWrites.get(userId) === nextWrite) presenceWrites.delete(userId);
    });
  };

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
      const guestToken = socket.handshake.auth.guestSessionToken;
      if (typeof guestToken === "string") {
        const guest = verifyGuestGameToken(guestToken, "guest-session");
        if (!guest || guest.kind !== "guest-session") {
          throw Object.assign(new Error("Session de joueur invité invalide."), { data: { statusCode: 401 } });
        }
        await AnonymousGameService.authenticateGuestSession(guest.gameId, guest.participantId);
        socket.data.userId = 0;
        socket.data.email = "";
        socket.data.role = "USER";
        socket.data.sessionId = 0;
        socket.data.accessToken = "";
        socket.data.guestParticipantId = guest.participantId;
        socket.data.guestGameId = guest.gameId;
        socket.data.participantId = null;
        socket.data.joinedGameIds = new Set();
        next();
        return;
      }
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
      socket.data.guestParticipantId = null;
      socket.data.guestGameId = null;
      socket.data.participantId = null;
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
    if (userSocket.data.userId > 0) {
      userPresence.add(userSocket.data.userId, userSocket.id);
      void synchronizePresence(userSocket.data.userId).catch((error) => {
        console.error("Erreur de mise à jour de présence WebSocket :", error);
        if (userSocket.connected) userSocket.disconnect(true);
      });
      userSocket.join(`user:${userSocket.data.userId}`);
    } else if (userSocket.data.guestParticipantId !== null) {
      userSocket.join(`guest:${userSocket.data.guestParticipantId}`);
    }

    const sessionCheck = setInterval(() => {
      const check = userSocket.data.guestParticipantId !== null
        ? AnonymousGameService.authenticateGuestSession(
            userSocket.data.guestGameId ?? 0,
            userSocket.data.guestParticipantId,
          )
        : authenticateAccessToken(userSocket.data.accessToken);
      void check.catch(() => userSocket.disconnect(true));
    }, config.sessionValidationIntervalMs);
    sessionCheck.unref();

    userSocket.on(PRIVATE_MESSAGE_EVENTS.JOIN, async (payload, acknowledge) => {
      try {
        const conversationId = readPositiveId(payload?.conversationId);
        if (conversationId === null) {
          throw Object.assign(new Error("Identifiant de conversation invalide."), {
            statusCode: 422,
          });
        }
        await authenticateAccessToken(userSocket.data.accessToken);
        await MessageService.getConversationInfo(conversationId, userSocket.data.userId);
        await userSocket.join(`conversation:${conversationId}`);
        await MessageService.markAsRead(conversationId, userSocket.data.userId);
        await MessageBroadcastService.broadcastUserJoinedConversation(
          conversationId,
          userSocket.data.userId,
        );
        acknowledge?.({ success: true, data: { conversationId } });
      } catch (error) {
        acknowledgeError(error, acknowledge);
      }
    });

    userSocket.on(PRIVATE_MESSAGE_EVENTS.LEAVE, async (payload, acknowledge) => {
      const conversationId = readPositiveId(payload?.conversationId);
      if (conversationId === null) {
        acknowledgeError(
          Object.assign(new Error("Identifiant de conversation invalide."), { statusCode: 422 }),
          acknowledge,
        );
        return;
      }
      const room = `conversation:${conversationId}`;
      if (!userSocket.rooms.has(room)) {
        acknowledge?.({ success: true, data: { conversationId } });
        return;
      }
      try {
        await authenticateAccessToken(userSocket.data.accessToken);
        await userSocket.leave(room);
        await MessageBroadcastService.broadcastUserLeftConversation(
          conversationId,
          userSocket.data.userId,
        );
        acknowledge?.({ success: true, data: { conversationId } });
      } catch (error) {
        acknowledgeError(error, acknowledge);
      }
    });

    userSocket.on(PRIVATE_MESSAGE_EVENTS.SEND, async (payload, acknowledge) => {
      try {
        const conversationId = readPositiveId(payload?.conversationId);
        if (conversationId === null) {
          throw Object.assign(new Error("Identifiant de conversation invalide."), {
            statusCode: 422,
          });
        }
        await authenticateAccessToken(userSocket.data.accessToken);
        const message = await MessageService.sendMessage(
          conversationId,
          userSocket.data.userId,
          payload.content,
        );
        acknowledge?.({ success: true, data: serializePayload(message) });
      } catch (error) {
        acknowledgeError(error, acknowledge);
      }
    });

    const broadcastTyping = async (
      payload: { conversationId: number },
      started: boolean,
    ) => {
      const conversationId = readPositiveId(payload?.conversationId);
      if (conversationId === null) return;
      const room = `conversation:${conversationId}`;
      if (!userSocket.rooms.has(room)) return;
      try {
        await authenticateAccessToken(userSocket.data.accessToken);
        await MessageService.getConversationInfo(conversationId, userSocket.data.userId);
        if (started) {
          await MessageBroadcastService.broadcastUserTyping(
            conversationId,
            userSocket.data.userId,
          );
        } else {
          await MessageBroadcastService.broadcastUserStoppedTyping(
            conversationId,
            userSocket.data.userId,
          );
        }
      } catch (error) {
        acknowledgeError(error);
        await userSocket.leave(room);
      }
    };
    userSocket.on(PRIVATE_MESSAGE_EVENTS.TYPING_START, (payload) => {
      void broadcastTyping(payload, true);
    });
    userSocket.on(PRIVATE_MESSAGE_EVENTS.TYPING_STOP, (payload) => {
      void broadcastTyping(payload, false);
    });

    userSocket.on(CONNECTION_EVENTS.JOIN_GAME, async (payload, acknowledge) => {
      let gameId: number | null = null;
      try {
        gameId = readPositiveId(payload?.gameId);
        if (gameId === null) {
          throw Object.assign(new Error("Identifiant de partie invalide."), { statusCode: 422 });
        }
        const isGuest = userSocket.data.guestParticipantId !== null;
        if (isGuest) {
          if (userSocket.data.guestGameId !== gameId) {
            throw Object.assign(new Error("Cette session invité ne correspond pas à cette partie."), {
              statusCode: 403,
            });
          }
          await AnonymousGameService.authenticateGuestSession(
            gameId,
            userSocket.data.guestParticipantId!,
          );
        } else {
          await authenticateAccessToken(userSocket.data.accessToken);
        }
        const state = isGuest
          ? await GameService.getGameForGuest(gameId, userSocket.data.guestParticipantId!)
          : await GameService.getGameForUser(gameId, userSocket.data.userId);
        const participant = state.participants.find((row) =>
          isGuest
            ? row.id === userSocket.data.guestParticipantId
            : row.userId === userSocket.data.userId && row.participantType === "USER",
        );
        if (!participant) {
          throw Object.assign(new Error("Vous ne participez pas à cette partie."), { statusCode: 403 });
        }
        userSocket.data.participantId = participant.id;
        await userSocket.join(`game:${gameId}`);
        userSocket.data.joinedGameIds.add(gameId);
        const roomSockets = await io.in(`game:${gameId}`).fetchSockets();
        const readiness = await GameService.startWhenParticipantsReady(
          gameId,
          participant.id,
          new Set(roomSockets
            .map((roomSocket) => roomSocket.data.participantId)
            .filter((id): id is number => typeof id === "number")),
        );
        if (readiness.started) {
          io.to(`game:${gameId}`).emit(GAME_EVENTS.UPDATED, {
            action: GAME_ACTIONS.STARTED,
            result: { game: serializeGame(readiness.game) },
          });
        }
        const clock = await GameService.getClock(gameId);
        const moves = isGuest
          ? await MoveService.getMovesForGuest(gameId, participant.id)
          : await MoveService.getMoves(gameId, userSocket.data.userId);
        const messages = isGuest
          ? await GameChatService.getMessagesForGuest(gameId, participant.id)
          : await GameChatService.getMessages(gameId, userSocket.data.userId);
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
          ...(userSocket.data.userId > 0 ? { userId: userSocket.data.userId } : {}),
          participantId: participant.id,
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
      if (userSocket.data.participantId !== null) {
        userSocket.to(`game:${gameId}`).emit(CONNECTION_EVENTS.PLAYER_LEFT, {
          ...(userSocket.data.userId > 0 ? { userId: userSocket.data.userId } : {}),
          participantId: userSocket.data.participantId,
        });
      }
      if (!io.sockets.adapter.rooms.get(`game:${gameId}`)?.size) stopClock(gameId);
      acknowledge?.({ success: true, data: { gameId } });
    });

    userSocket.on(MOVE_EVENTS.PLAY, async (payload, acknowledge) => {
      try {
        const gameId = readPositiveId(payload?.gameId);
        if (gameId === null) {
          throw Object.assign(new Error("Identifiant de partie invalide."), { statusCode: 422 });
        }
        if (!userSocket.data.joinedGameIds.has(gameId)) {
          throw Object.assign(new Error("Rejoignez la partie avant de jouer."), { statusCode: 403 });
        }
        const isGuest = userSocket.data.guestParticipantId !== null;
        if (isGuest) {
          if (userSocket.data.guestGameId !== gameId) {
            throw Object.assign(new Error("Session invité invalide pour cette partie."), { statusCode: 403 });
          }
          await AnonymousGameService.authenticateGuestSession(gameId, userSocket.data.guestParticipantId!);
        } else {
          await authenticateAccessToken(userSocket.data.accessToken);
        }
        const gameState = isGuest
          ? await GameService.getGameForGuest(gameId, userSocket.data.guestParticipantId!)
          : await GameService.getGameForUser(gameId, userSocket.data.userId);
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

        const moveInput = {
          from: payload.from,
          to: payload.to,
          ...(payload.promotion ? { promotion: payload.promotion } : {}),
        };
        const result = isGuest
          ? await MoveService.playMoveAsParticipant(gameId, userSocket.data.guestParticipantId!, moveInput)
          : await MoveService.playMove(gameId, userSocket.data.userId, moveInput);
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
        const state = isGuest
          ? await GameService.getGameForGuest(gameId, userSocket.data.guestParticipantId!)
          : await GameService.getGameForUser(gameId, userSocket.data.userId);
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
      operation: (
        gameId: number,
        actor: { userId: number } | { participantId: number },
      ) => Promise<unknown>,
      acknowledge?: Acknowledge,
    ) => {
      try {
        const gameId = readPositiveId(rawGameId);
        if (gameId === null) {
          throw Object.assign(new Error("Identifiant de partie invalide."), { statusCode: 422 });
        }
        if (!userSocket.data.joinedGameIds.has(gameId)) {
          throw Object.assign(new Error("Rejoignez la partie avant cette action."), { statusCode: 403 });
        }
        const isGuest = userSocket.data.guestParticipantId !== null;
        let actor: { userId: number } | { participantId: number };
        if (isGuest) {
          if (userSocket.data.guestGameId !== gameId) {
            throw Object.assign(new Error("Session invité invalide pour cette partie."), {
              statusCode: 403,
            });
          }
          await AnonymousGameService.authenticateGuestSession(
            gameId,
            userSocket.data.guestParticipantId!,
          );
          actor = { participantId: userSocket.data.guestParticipantId! };
        } else {
          await authenticateAccessToken(userSocket.data.accessToken);
          actor = { userId: userSocket.data.userId };
        }
        const result = await operation(gameId, actor);
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
          (game.status === "FINISHED" || game.status === "CANCELLED")
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
        (gameId, actor) => "userId" in actor
          ? GameService.offerDraw(gameId, actor.userId)
          : GameService.offerDrawAsParticipant(gameId, actor.participantId),
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
        (gameId, actor) => "userId" in actor
          ? GameService.respondToDraw(gameId, actor.userId, payload.accept)
          : GameService.respondToDrawAsParticipant(gameId, actor.participantId, payload.accept),
        acknowledge,
      );
    });
    userSocket.on(GAME_EVENTS.REQUEST_UNDO, (payload, acknowledge) => {
      void executeAction(
        payload?.gameId,
        GAME_ACTIONS.UNDO_REQUESTED,
        (gameId, actor) => "userId" in actor
          ? GameService.requestUndo(gameId, actor.userId)
          : GameService.requestUndoAsParticipant(gameId, actor.participantId),
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
        (gameId, actor) => "userId" in actor
          ? GameService.respondToUndo(gameId, actor.userId, payload.accept)
          : GameService.respondToUndoAsParticipant(gameId, actor.participantId, payload.accept),
        acknowledge,
      );
    });
    userSocket.on(GAME_EVENTS.RESIGN, (payload, acknowledge) => {
      void executeAction(
        payload?.gameId,
        GAME_ACTIONS.RESIGNED,
        (gameId, actor) => "userId" in actor
          ? GameService.resign(gameId, actor.userId)
          : GameService.resignAsParticipant(gameId, actor.participantId),
        acknowledge,
      );
    });
    userSocket.on(GAME_EVENTS.CLAIM_NO_SHOW, (payload, acknowledge) => {
      if (
        payload?.outcome !== "DRAW" &&
        payload?.outcome !== "CANCEL" &&
        payload?.outcome !== "WIN"
      ) {
        acknowledge?.({ success: false, error: "Résolution d'absence invalide." });
        return;
      }
      const action = payload.outcome === "DRAW"
        ? GAME_ACTIONS.NO_SHOW_DRAW
        : payload.outcome === "WIN"
          ? GAME_ACTIONS.NO_SHOW_WIN
          : GAME_ACTIONS.NO_SHOW_CANCELLED;
      void executeAction(
        payload.gameId,
        action,
        (gameId, actor) => "userId" in actor
          ? GameService.claimNoShow(gameId, actor.userId, payload.outcome)
          : GameService.claimNoShowAsParticipant(gameId, actor.participantId, payload.outcome),
        acknowledge,
      );
    });
    userSocket.on(GAME_CHAT_EVENTS.SEND_MESSAGE, async (payload, acknowledge) => {
      try {
        const gameId = readPositiveId(payload?.gameId);
        if (gameId === null) {
          throw Object.assign(new Error("Identifiant de partie invalide."), { statusCode: 422 });
        }
        if (!userSocket.data.joinedGameIds.has(gameId)) {
          throw Object.assign(new Error("Rejoignez la partie avant d'envoyer un message."), {
            statusCode: 403,
          });
        }
        const isGuest = userSocket.data.guestParticipantId !== null;
        if (isGuest) {
          if (userSocket.data.guestGameId !== gameId) {
            throw Object.assign(new Error("Session invité invalide pour cette partie."), {
              statusCode: 403,
            });
          }
          await AnonymousGameService.authenticateGuestSession(gameId, userSocket.data.guestParticipantId!);
        } else {
          await authenticateAccessToken(userSocket.data.accessToken);
        }
        if (typeof payload.content !== "string") {
          throw Object.assign(new Error("Le message doit contenir entre 1 et 2000 caractères."), {
            statusCode: 422,
          });
        }
        const message = isGuest
          ? await GameChatService.sendMessageAsGuest(
              gameId,
              userSocket.data.guestParticipantId!,
              payload.content,
            )
          : await GameChatService.sendMessage(gameId, userSocket.data.userId, payload.content);
        io.to(`game:${gameId}`).emit(GAME_CHAT_EVENTS.MESSAGE, message);
        acknowledge?.({ success: true, data: message });
      } catch (error) {
        const response = acknowledgeError(error, acknowledge);
        userSocket.emit(CONNECTION_EVENTS.GAME_ERROR, response);
      }
    });

    userSocket.on(CONNECTION_EVENTS.DISCONNECTING, () => {
      clearInterval(sessionCheck);
      if (userSocket.data.userId > 0) {
        userPresence.remove(userSocket.data.userId, userSocket.id);
        void synchronizePresence(userSocket.data.userId).catch((error) => {
          console.error("Erreur de mise à jour de présence WebSocket :", error);
        });
      }
      for (const room of userSocket.rooms) {
        const conversationMatch = /^conversation:(\d+)$/.exec(room);
        if (conversationMatch) {
          void MessageBroadcastService.broadcastUserLeftConversation(
            Number(conversationMatch[1]),
            userSocket.data.userId,
          );
          continue;
        }
        const match = /^game:(\d+)$/.exec(room);
        if (!match) continue;
        const gameId = Number(match[1]);
        if (userSocket.data.participantId !== null) {
          userSocket.to(room).emit(CONNECTION_EVENTS.PLAYER_LEFT, {
            ...(userSocket.data.userId > 0 ? { userId: userSocket.data.userId } : {}),
            participantId: userSocket.data.participantId,
          });
        }
        userSocket.data.joinedGameIds.delete(gameId);
        setTimeout(() => {
          if (!io.sockets.adapter.rooms.get(room)?.size) stopClock(gameId);
        }, 0);
      }
    });
  });

  return io;
}
