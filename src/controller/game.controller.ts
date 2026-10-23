import type { RequestHandler } from "express";
import type {
  CreateGameData,
  CreateGameParticipantData,
} from "../repository/game.repository";
import { GameService } from "../service/gameService";
import { MoveService } from "../service/moveService";
import { GameChatService } from "../service/gameChatService";
import { GAME_ACTIONS } from "../events/game.events";
import { publishGameBroadcast } from "../events/game.broadcast";
import { AnonymousGameService } from "../service/anonymousGameService";
import { NotificationService } from "../service/notificationService";
import { MatchmakingService } from "../service/matchmakingService";
import HttpError from "../service/errorService";
import { verifyGuestGameToken } from "../utils/guestGameToken";
import {
  readBody,
  readParamId,
  requireCurrentUser,
  serializeBigInts,
} from "./controller.utils";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeGame(game: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(game, (_, v) =>
    typeof v === "bigint" ? Number(v) : v
  ));
}

async function requireGuestParticipantId(
  authorization: string | undefined,
  gameId: number,
) {
  const match = authorization ? /^Bearer\s+(\S+)$/i.exec(authorization) : null;
  const token = match?.[1];
  if (!token) throw new HttpError("Authentification invité requise.", 401, false);

  const payload = verifyGuestGameToken(token, "guest-session");
  if (!payload || payload.kind !== "guest-session") {
    throw new HttpError("Session de joueur invité invalide ou expirée.", 401, false);
  }
  if (payload.gameId !== gameId) {
    throw new HttpError("Cette session invité ne correspond pas à cette partie.", 403, false);
  }
  const participant = await AnonymousGameService.authenticateGuestSession(
    gameId,
    payload.participantId,
  );
  return participant.id;
}

export const GameController = {
  createGame: (async (request, response) => {
    requireCurrentUser(response);
    const body = readBody(request);
    if (!isRecord(body.gameData) || !Array.isArray(body.participants)) {
      response.status(422).json({
        success: false,
        message: "Les données de la partie et ses participants sont requis.",
      });
      return;
    }

    response.status(201).json(await GameService.createGame(
      body.gameData as CreateGameData,
      body.participants as CreateGameParticipantData[],
    ));
  }) satisfies RequestHandler,

  createMatchmakingGame: (async (request, response) => {
    const body = readBody(request);
    if (
      typeof body.initialTimeSeconds !== "number" ||
      !Number.isSafeInteger(body.initialTimeSeconds) ||
      (body.incrementSeconds !== undefined &&
        (typeof body.incrementSeconds !== "number" ||
          !Number.isSafeInteger(body.incrementSeconds)))
    ) {
      response.status(422).json({
        success: false,
        message: "Contrôle du temps invalide.",
      });
      return;
    }
    const user = response.locals.user as { id: number } | undefined;
    response.status(201).json(serializeBigInts(
      await MatchmakingService.createQueueGame(
        body.initialTimeSeconds,
        typeof body.incrementSeconds === "number" ? body.incrementSeconds : 0,
        user?.id ?? null,
      ),
    ));
  }) satisfies RequestHandler,

  getGame: (async (request, response) => {
    requireCurrentUser(response);
    const games = await GameService.getGame(readParamId(request, "gameId"));
    response.status(200).json(serializeBigInts(games));
  }) satisfies RequestHandler,

  getGamesForCurrentUser: (async (request, response) => {
    const user = requireCurrentUser(response);
    const rawLimit = request.query.limit;
    let limit = 100;
    if (rawLimit !== undefined) {
      if (typeof rawLimit !== "string" || !/^[1-9]\d*$/.test(rawLimit)) {
        response.status(422).json({ success: false, message: "Limite invalide." });
        return;
      }
      limit = Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit > 100) {
        response.status(422).json({ success: false, message: "La limite maximale est 100." });
        return;
      }
    }
    const games = await GameService.getGamesForUser(user.id, limit);
    response.status(200).json(games.map(serializeGame));
  }) satisfies RequestHandler,

  playMove: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = readBody(request);
    if (
      typeof body.from !== "string" ||
      typeof body.to !== "string" ||
      (body.promotion !== undefined &&
        body.promotion !== "QUEEN" &&
        body.promotion !== "ROOK" &&
        body.promotion !== "BISHOP" &&
        body.promotion !== "KNIGHT")
    ) {
      response.status(422).json({ success: false, message: "Données de coup invalides." });
      return;
    }

    const gameId = readParamId(request, "gameId");
    const result = await MoveService.playMove(
      gameId,
      user.id,
      {
        from: body.from,
        to: body.to,
        ...(body.promotion ? { promotion: body.promotion } : {}),
      },
    );
    if ("timedOut" in result) {
      const serializedResult = serializeBigInts({ game: result.game });
      publishGameBroadcast({
        type: "updated",
        gameId,
        action: GAME_ACTIONS.TIMEOUT,
        result: serializedResult,
      });
      response.status(201).json(serializedResult);
      return;
    }
    const serializedResult = serializeBigInts({ game: result.game, move: result.move });
    publishGameBroadcast({ type: "move-played", gameId, result: serializedResult });
    response.status(201).json(serializedResult);
  }) satisfies RequestHandler,

  playGuestMove: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(
      request.headers.authorization,
      gameId,
    );
    const body = readBody(request);
    if (
      typeof body.from !== "string" ||
      typeof body.to !== "string" ||
      (body.promotion !== undefined &&
        body.promotion !== "QUEEN" &&
        body.promotion !== "ROOK" &&
        body.promotion !== "BISHOP" &&
        body.promotion !== "KNIGHT")
    ) {
      response.status(422).json({ success: false, message: "Données de coup invalides." });
      return;
    }

    const result = await MoveService.playMoveAsParticipant(gameId, participantId, {
      from: body.from,
      to: body.to,
      ...(body.promotion ? { promotion: body.promotion } : {}),
    });
    if ("timedOut" in result) {
      const serializedResult = serializeBigInts({ game: result.game });
      publishGameBroadcast({
        type: "updated",
        gameId,
        action: GAME_ACTIONS.TIMEOUT,
        result: serializedResult,
      });
      response.status(201).json(serializedResult);
      return;
    }

    const serializedResult = serializeBigInts({ game: result.game, move: result.move });
    publishGameBroadcast({ type: "move-played", gameId, result: serializedResult });
    response.status(201).json(serializedResult);
  }) satisfies RequestHandler,

  getMoves: (async (request, response) => {
    const user = requireCurrentUser(response);
    const moves = await MoveService.getMoves(
      readParamId(request, "gameId"),
      user.id,
    )
    response.status(200).json(moves);
  }) satisfies RequestHandler,

  getGuestMoves: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(
      request.headers.authorization,
      gameId,
    );
    response.status(200).json(serializeBigInts(
      await MoveService.getMovesForGuest(gameId, participantId),
    ));
  }) satisfies RequestHandler,

  getGuestMessages: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(
      request.headers.authorization,
      gameId,
    );
    response.status(200).json(serializeBigInts(
      await GameChatService.getMessagesForGuest(gameId, participantId),
    ));
  }) satisfies RequestHandler,

  getGuestNotifications: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(
      request.headers.authorization,
      gameId,
    );
    const rawLimit = request.query.limit;
    let limit = 50;
    if (rawLimit !== undefined) {
      if (typeof rawLimit !== "string" || !/^[1-9]\d*$/.test(rawLimit)) {
        response.status(422).json({ success: false, message: "Limite invalide." });
        return;
      }
      limit = Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit > 100) {
        response.status(422).json({ success: false, message: "La limite maximale est 100." });
        return;
      }
    }
    response.status(200).json(serializeBigInts(
      await NotificationService.getForGuest(participantId, limit),
    ));
  }) satisfies RequestHandler,

  sendGuestMessage: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(
      request.headers.authorization,
      gameId,
    );
    const body = readBody(request);
    if (typeof body.content !== "string") {
      response.status(422).json({ success: false, message: "Le contenu du message est requis." });
      return;
    }
    const message = serializeBigInts(
      await GameChatService.sendMessageAsGuest(gameId, participantId, body.content),
    );
    publishGameBroadcast({ type: "chat-message", gameId, message });
    response.status(201).json(message);
  }) satisfies RequestHandler,

  offerDrawAsGuest: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(request.headers.authorization, gameId);
    const result = serializeBigInts(await GameService.offerDrawAsParticipant(gameId, participantId));
    publishGameBroadcast({ type: "updated", gameId, action: GAME_ACTIONS.DRAW_OFFERED, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  respondToDrawAsGuest: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(request.headers.authorization, gameId);
    const body = readBody(request);
    if (typeof body.accept !== "boolean") {
      response.status(422).json({ success: false, message: "Le champ accept doit être booléen." });
      return;
    }
    const action = body.accept ? GAME_ACTIONS.DRAW_ACCEPTED : GAME_ACTIONS.DRAW_DECLINED;
    const result = serializeBigInts(
      await GameService.respondToDrawAsParticipant(gameId, participantId, body.accept),
    );
    publishGameBroadcast({ type: "updated", gameId, action, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  requestUndoAsGuest: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(request.headers.authorization, gameId);
    const result = serializeBigInts(await GameService.requestUndoAsParticipant(gameId, participantId));
    publishGameBroadcast({ type: "updated", gameId, action: GAME_ACTIONS.UNDO_REQUESTED, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  respondToUndoAsGuest: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(request.headers.authorization, gameId);
    const body = readBody(request);
    if (typeof body.accept !== "boolean") {
      response.status(422).json({ success: false, message: "Le champ accept doit être booléen." });
      return;
    }
    const action = body.accept ? GAME_ACTIONS.UNDO_ACCEPTED : GAME_ACTIONS.UNDO_DECLINED;
    const result = serializeBigInts(
      await GameService.respondToUndoAsParticipant(gameId, participantId, body.accept),
    );
    publishGameBroadcast({ type: "updated", gameId, action, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  resignAsGuest: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(request.headers.authorization, gameId);
    const result = serializeBigInts(await GameService.resignAsParticipant(gameId, participantId));
    publishGameBroadcast({ type: "updated", gameId, action: GAME_ACTIONS.RESIGNED, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  claimNoShowAsGuest: (async (request, response) => {
    const gameId = readParamId(request, "gameId");
    const participantId = await requireGuestParticipantId(request.headers.authorization, gameId);
    const body = readBody(request);
    if (body.outcome !== "DRAW" && body.outcome !== "CANCEL" && body.outcome !== "WIN") {
      response.status(422).json({ success: false, message: "Résolution d'absence invalide." });
      return;
    }
    const action = body.outcome === "DRAW"
      ? GAME_ACTIONS.NO_SHOW_DRAW
      : body.outcome === "WIN"
        ? GAME_ACTIONS.NO_SHOW_WIN
        : GAME_ACTIONS.NO_SHOW_CANCELLED;
    const result = serializeBigInts(
      await GameService.claimNoShowAsParticipant(gameId, participantId, body.outcome),
    );
    publishGameBroadcast({ type: "updated", gameId, action, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  offerDraw: (async (request, response) => {
    const user = requireCurrentUser(response);
    const gameId = readParamId(request, "gameId");
    const result = serializeBigInts(await GameService.offerDraw(gameId, user.id));
    publishGameBroadcast({ type: "updated", gameId, action: GAME_ACTIONS.DRAW_OFFERED, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  respondToDraw: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = readBody(request);
    if (typeof body.accept !== "boolean") {
      response.status(422).json({ success: false, message: "Le champ accept doit être booléen." });
      return;
    }
    const gameId = readParamId(request, "gameId");
    const action = body.accept ? GAME_ACTIONS.DRAW_ACCEPTED : GAME_ACTIONS.DRAW_DECLINED;
    const result = serializeBigInts(
      await GameService.respondToDraw(gameId, user.id, body.accept),
    );
    publishGameBroadcast({ type: "updated", gameId, action, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  requestUndo: (async (request, response) => {
    const user = requireCurrentUser(response);
    const gameId = readParamId(request, "gameId");
    const result = serializeBigInts(await GameService.requestUndo(gameId, user.id));
    publishGameBroadcast({ type: "updated", gameId, action: GAME_ACTIONS.UNDO_REQUESTED, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  respondToUndo: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = readBody(request);
    if (typeof body.accept !== "boolean") {
      response.status(422).json({ success: false, message: "Le champ accept doit être booléen." });
      return;
    }
    const gameId = readParamId(request, "gameId");
    const action = body.accept ? GAME_ACTIONS.UNDO_ACCEPTED : GAME_ACTIONS.UNDO_DECLINED;
    const result = serializeBigInts(
      await GameService.respondToUndo(gameId, user.id, body.accept),
    );
    publishGameBroadcast({ type: "updated", gameId, action, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  resign: (async (request, response) => {
    const user = requireCurrentUser(response);
    const gameId = readParamId(request, "gameId");
    const result = serializeBigInts(await GameService.resign(gameId, user.id));
    publishGameBroadcast({ type: "updated", gameId, action: GAME_ACTIONS.RESIGNED, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  claimNoShow: (async (request, response) => {
    const user = requireCurrentUser(response);
    const gameId = readParamId(request, "gameId");
    const body = readBody(request);
    if (body.outcome !== "DRAW" && body.outcome !== "CANCEL" && body.outcome !== "WIN") {
      response.status(422).json({ success: false, message: "Résolution d'absence invalide." });
      return;
    }
    const action = body.outcome === "DRAW"
      ? GAME_ACTIONS.NO_SHOW_DRAW
      : body.outcome === "WIN"
        ? GAME_ACTIONS.NO_SHOW_WIN
        : GAME_ACTIONS.NO_SHOW_CANCELLED;
    const result = serializeBigInts(await GameService.claimNoShow(gameId, user.id, body.outcome));
    publishGameBroadcast({ type: "updated", gameId, action, result });
    response.status(200).json(result);
  }) satisfies RequestHandler,

  getClock: (async (request, response) => {
    const user = requireCurrentUser(response);
    const gameId = readParamId(request, "gameId");
    await GameService.getGameForUser(gameId, user.id);
    response.status(200).json(serializeBigInts(
      await GameService.getClock(gameId),
    ));
  }) satisfies RequestHandler,

  getMessages: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(serializeBigInts(
      await GameChatService.getMessages(readParamId(request, "gameId"), user.id),
    ));
  }) satisfies RequestHandler,

  sendMessage: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = readBody(request);
    if (typeof body.content !== "string") {
      response.status(422).json({ success: false, message: "Le contenu du message est requis." });
      return;
    }
    const gameId = readParamId(request, "gameId");
    const message = serializeBigInts(
      await GameChatService.sendMessage(gameId, user.id, body.content),
    );
    publishGameBroadcast({ type: "chat-message", gameId, message });
    response.status(201).json(message);
  }) satisfies RequestHandler,
};