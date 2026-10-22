import type { RequestHandler } from "express";
import { readParamId, requireCurrentUser } from "./controller.utils";
import { GameAnalysisService } from "../service/gameAnalysisService";

export const GameAnalysisController = {
  get: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await GameAnalysisService.getForUser(
      readParamId(request, "gameId"),
      user.id,
    ));
  }) satisfies RequestHandler,

  request: (async (request, response) => {
    const user = requireCurrentUser(response);
    const result = await GameAnalysisService.requestForUser(
      readParamId(request, "gameId"),
      user.id,
    );
    response.status(result.status === "READY" ? 200 : 202).json(result);
  }) satisfies RequestHandler,
};
