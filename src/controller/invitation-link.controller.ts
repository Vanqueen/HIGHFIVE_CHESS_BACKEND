import type { RequestHandler } from "express";
import type { AuthenticatedUser } from "../middlewares/auth.middleware";
import { AnonymousGameService } from "../service/anonymousGameService";
import { InvitationLinkService } from "../service/invitationLinkService";
import {
  readBody,
  readParamId,
  requireCurrentUser,
  serializeBigInts,
} from "./controller.utils";

export const InvitationLinkController = {
  createAnonymousGame: (async (request, response) => {
    const body = request.body === undefined ? {} : readBody(request);
    if (
      typeof body.initialTimeSeconds !== "number" ||
      !Number.isSafeInteger(body.initialTimeSeconds) ||
      (body.incrementSeconds !== undefined &&
        (typeof body.incrementSeconds !== "number" ||
          !Number.isSafeInteger(body.incrementSeconds))) ||
      (body.colorPreference !== undefined &&
        body.colorPreference !== "WHITE" &&
        body.colorPreference !== "BLACK" &&
        body.colorPreference !== "RANDOM")
    ) {
      response.status(422).json({ success: false, message: "Contrôle du temps invalide." });
      return;
    }
    response.status(201).json(serializeBigInts(
      await AnonymousGameService.createGame(
        body.initialTimeSeconds,
        typeof body.incrementSeconds === "number" ? body.incrementSeconds : 0,
        typeof body.colorPreference === "string"
          ? body.colorPreference as "WHITE" | "BLACK" | "RANDOM"
          : "RANDOM",
      ),
    ));
  }) satisfies RequestHandler,

  joinAnonymousGame: (async (request, response) => {
    const user = response.locals.user as AuthenticatedUser | undefined;
    const body = readBody(request);
    if (typeof body.token !== "string") {
      response.status(422).json({ success: false, message: "Jeton d'invitation requis." });
      return;
    }
    response.status(200).json(serializeBigInts(
      await AnonymousGameService.joinWithInvite(body.token, user?.id ?? null),
    ));
  }) satisfies RequestHandler,

  createForChallenge: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = request.body === undefined ? {} : readBody(request);
    if (
      body.expiresInMinutes !== undefined &&
      (typeof body.expiresInMinutes !== "number" ||
        !Number.isSafeInteger(body.expiresInMinutes))
    ) {
      response.status(422).json({ success: false, message: "Durée du lien invalide." });
      return;
    }
    response.status(201).json(await InvitationLinkService.createChallengeLink(
      user.id,
      readParamId(request, "challengeId"),
      typeof body.expiresInMinutes === "number" ? body.expiresInMinutes : 30,
    ));
  }) satisfies RequestHandler,

  listForChallenge: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await InvitationLinkService.getChallengeLinks(
      user.id,
      readParamId(request, "challengeId"),
    ));
  }) satisfies RequestHandler,

  revokeForChallenge: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await InvitationLinkService.revokeChallengeLink(
      user.id,
      readParamId(request, "challengeId"),
      readParamId(request, "linkId"),
    ));
  }) satisfies RequestHandler,

  redeem: (async (request, response) => {
    const user = response.locals.user as AuthenticatedUser | undefined;
    const body = readBody(request);
    if (typeof body.token !== "string") {
      response.status(422).json({ success: false, message: "Jeton d'invitation requis." });
      return;
    }
    response.status(200).json(serializeBigInts(
      await InvitationLinkService.redeemChallengeLink(body.token, user?.id ?? null),
    ));
  }) satisfies RequestHandler,
};
