import type { RequestHandler } from "express";
import { TournamentService } from "../service/tournamentService";
import {
  readBody,
  readParamId,
  requireCurrentUser,
  serializeBigInts,
} from "./controller.utils";

function readDate(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value);
}

export const TournamentController = {
  create: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = readBody(request);
    const registrationStartsAt = readDate(body, "registrationStartsAt");
    const registrationEndsAt = readDate(body, "registrationEndsAt");
    const startsAt = readDate(body, "startsAt");
    if (
      typeof body.name !== "string" ||
      (body.description !== undefined &&
        body.description !== null &&
        typeof body.description !== "string") ||
      (body.format !== "SWISS" && body.format !== "ROUND_ROBIN") ||
      typeof body.maxParticipants !== "number" ||
      !Number.isSafeInteger(body.maxParticipants) ||
      !registrationStartsAt ||
      !registrationEndsAt ||
      !startsAt ||
      (body.isRated !== undefined && typeof body.isRated !== "boolean") ||
      (body.ratingCategory !== undefined &&
        body.ratingCategory !== null &&
        body.ratingCategory !== "BLITZ" &&
        body.ratingCategory !== "RAPID" &&
        body.ratingCategory !== "CLASSICAL")
    ) {
      response.status(422).json({ success: false, message: "Données de tournoi invalides." });
      return;
    }
    response.status(201).json(serializeBigInts(await TournamentService.createTournament(
      user.id,
      {
        name: body.name,
        description: typeof body.description === "string" ? body.description : null,
        format: body.format,
        maxParticipants: body.maxParticipants,
        registrationStartsAt,
        registrationEndsAt,
        startsAt,
        isRated: typeof body.isRated === "boolean" ? body.isRated : false,
        ratingCategory:
          body.ratingCategory === "BLITZ" ||
          body.ratingCategory === "RAPID" ||
          body.ratingCategory === "CLASSICAL"
            ? body.ratingCategory
            : null,
      },
    )));
  }) satisfies RequestHandler,

  list: (async (request, response) => {
    const rawLimit = request.query.limit;
    let limit = 100;
    if (rawLimit !== undefined) {
      if (typeof rawLimit !== "string" || !/^[1-9]\d*$/.test(rawLimit)) {
        response.status(422).json({ success: false, message: "Limite invalide." });
        return;
      }
      limit = Number(rawLimit);
    }
    response.status(200).json(await TournamentService.listTournaments(limit));
  }) satisfies RequestHandler,

  get: (async (request, response) => {
    response.status(200).json(serializeBigInts(
      await TournamentService.getTournament(readParamId(request, "tournamentId")),
    ));
  }) satisfies RequestHandler,

  standings: (async (request, response) => {
    response.status(200).json(await TournamentService.getStandings(
      readParamId(request, "tournamentId"),
    ));
  }) satisfies RequestHandler,

  round: (async (request, response) => {
    const rawRoundNumber = request.params.roundNumber;
    if (typeof rawRoundNumber !== "string" || !/^[1-9]\d*$/.test(rawRoundNumber)) {
      response.status(422).json({ success: false, message: "Numéro de ronde invalide." });
      return;
    }
    const roundNumber = Number(rawRoundNumber);
    if (!Number.isSafeInteger(roundNumber)) {
      response.status(422).json({ success: false, message: "Numéro de ronde invalide." });
      return;
    }
    response.status(200).json(serializeBigInts(await TournamentService.getRound(
      readParamId(request, "tournamentId"),
      roundNumber,
    )));
  }) satisfies RequestHandler,

  openRegistration: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await TournamentService.openRegistration(
      readParamId(request, "tournamentId"),
      user.id,
    ));
  }) satisfies RequestHandler,

  closeRegistration: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await TournamentService.closeRegistration(
      readParamId(request, "tournamentId"),
      user.id,
    ));
  }) satisfies RequestHandler,

  register: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(201).json(await TournamentService.registerUser(
      readParamId(request, "tournamentId"),
      user.id,
    ));
  }) satisfies RequestHandler,

  withdraw: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await TournamentService.withdrawUser(
      readParamId(request, "tournamentId"),
      user.id,
    ));
  }) satisfies RequestHandler,

  createInvitationLink: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = request.body === undefined ? {} : readBody(request);
    const maxUses = body.maxUses === undefined || body.maxUses === null
      ? null
      : body.maxUses;
    const expiresAt = body.expiresAt === undefined
      ? undefined
      : readDate(body, "expiresAt") ?? null;
    if (
      (maxUses !== null &&
        (typeof maxUses !== "number" || !Number.isSafeInteger(maxUses))) ||
      expiresAt === null
    ) {
      response.status(422).json({ success: false, message: "Paramètres du lien invalides." });
      return;
    }
    response.status(201).json(await TournamentService.createInvitationLink(
      readParamId(request, "tournamentId"),
      user.id,
      maxUses,
      expiresAt,
    ));
  }) satisfies RequestHandler,

  listInvitationLinks: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await TournamentService.listInvitationLinks(
      readParamId(request, "tournamentId"),
      user.id,
    ));
  }) satisfies RequestHandler,

  revokeInvitationLink: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await TournamentService.revokeInvitationLink(
      readParamId(request, "tournamentId"),
      user.id,
      readParamId(request, "linkId"),
    ));
  }) satisfies RequestHandler,

  redeemInvitationLink: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = readBody(request);
    if (typeof body.token !== "string") {
      response.status(422).json({ success: false, message: "Jeton d'invitation requis." });
      return;
    }
    response.status(201).json(await TournamentService.redeemInvitationLink(
      body.token,
      user.id,
    ));
  }) satisfies RequestHandler,

  start: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = readBody(request);
    if (
      typeof body.initialTimeSeconds !== "number" ||
      !Number.isSafeInteger(body.initialTimeSeconds) ||
      (body.incrementSeconds !== undefined &&
        (typeof body.incrementSeconds !== "number" ||
          !Number.isSafeInteger(body.incrementSeconds)))
    ) {
      response.status(422).json({ success: false, message: "Contrôle du temps invalide." });
      return;
    }
    response.status(201).json(serializeBigInts(await TournamentService.startTournament(
      readParamId(request, "tournamentId"),
      user.id,
      body.initialTimeSeconds,
      typeof body.incrementSeconds === "number" ? body.incrementSeconds : 0,
    )));
  }) satisfies RequestHandler,

  advanceRound: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(serializeBigInts(await TournamentService.advanceRound(
      readParamId(request, "tournamentId"),
      user.id,
    )));
  }) satisfies RequestHandler,

  cancel: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await TournamentService.cancel(
      readParamId(request, "tournamentId"),
      user.id,
    ));
  }) satisfies RequestHandler,
};
