import type { RequestHandler } from "express";
import type {
  CreateGameData,
  CreateGameParticipantData,
} from "../repository/game.repository";
import { GameService } from "../service/gameService";
import { MoveService } from "../service/moveService";
import {
  readBody,
  readParamId,
  requireCurrentUser,
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

    response.status(201).json(await MoveService.playMove(
      readParamId(request, "gameId"),
      user.id,
      {
        from: body.from,
        to: body.to,
        ...(body.promotion ? { promotion: body.promotion } : {}),
      },
    ));
  }) satisfies RequestHandler,

  getMoves: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await MoveService.getMoves(
      readParamId(request, "gameId"),
      user.id,
    ));
  }) satisfies RequestHandler,
};