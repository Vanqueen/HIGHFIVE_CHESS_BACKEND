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
import {
  readBody,
  readParamId,
  requireCurrentUser,
  serializeBigInts,
} from "./controller.utils";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  getGame: (async (request, response) => {
    requireCurrentUser(response);
    response.status(200).json(await GameService.getGame(readParamId(request, "gameId")));
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
    response.status(200).json(await GameService.getGamesForUser(user.id, limit));
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
    const state = await GameService.getGameForUser(gameId, user.id);
    const serializedResult = serializeBigInts({ game: state.game, move: result.move });
    publishGameBroadcast({ type: "move-played", gameId, result: serializedResult });
    response.status(201).json(serializedResult);
  }) satisfies RequestHandler,

  getMoves: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await MoveService.getMoves(
      readParamId(request, "gameId"),
      user.id,
    ));
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