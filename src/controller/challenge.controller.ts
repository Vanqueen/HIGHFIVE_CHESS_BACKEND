import type { RequestHandler } from "express";
import { ChallengeService } from "../service/challengeService";
import {
  readBody,
  readParamId,
  requireCurrentUser,
  serializeBigInts,
} from "./controller.utils";

export const ChallengeController = {
  create: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = readBody(request);
    if (
      (body.invitedUserId !== undefined &&
        body.invitedUserId !== null &&
        (typeof body.invitedUserId !== "number" ||
          !Number.isSafeInteger(body.invitedUserId) ||
          body.invitedUserId <= 0)) ||
      typeof body.initialTimeSeconds !== "number" ||
      !Number.isSafeInteger(body.initialTimeSeconds) ||
      body.initialTimeSeconds < 0 ||
      (body.incrementSeconds !== undefined &&
        (typeof body.incrementSeconds !== "number" ||
          !Number.isSafeInteger(body.incrementSeconds) ||
          body.incrementSeconds < 0))
    ) {
      response.status(422).json({ success: false, message: "Données de défi invalides." });
      return;
    }

    response.status(201).json(serializeBigInts(await ChallengeService.createChallenge(
      user.id,
      typeof body.invitedUserId === "number" ? body.invitedUserId : null,
      body.initialTimeSeconds,
      typeof body.incrementSeconds === "number" ? body.incrementSeconds : 0,
    )));
  }) satisfies RequestHandler,

  getMine: (async (request, response) => {
    const user = requireCurrentUser(response);
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
    response.status(200).json(await ChallengeService.getChallengesForUser(user.id, limit));
  }) satisfies RequestHandler,

  accept: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(serializeBigInts(
      await ChallengeService.acceptChallenge(readParamId(request, "challengeId"), user.id),
    ));
  }) satisfies RequestHandler,

  decline: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(
      await ChallengeService.declineChallenge(readParamId(request, "challengeId"), user.id),
    );
  }) satisfies RequestHandler,

  cancel: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(
      await ChallengeService.cancelChallenge(readParamId(request, "challengeId"), user.id),
    );
  }) satisfies RequestHandler,
};
