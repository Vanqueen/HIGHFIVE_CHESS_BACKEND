import { Router } from "express";
import { TournamentController } from "../controller/tournament.controller";
import { authenticate, requireRole } from "../middlewares/auth.middleware";

const tournamentsRouter = Router();

tournamentsRouter.get("/", TournamentController.list);
tournamentsRouter.get("/:tournamentId/standings", TournamentController.standings);
tournamentsRouter.get("/:tournamentId/rounds/:roundNumber", TournamentController.round);
tournamentsRouter.get("/:tournamentId", TournamentController.get);

tournamentsRouter.use(authenticate);
tournamentsRouter.post(
  "/",
  requireRole("ORGANIZER", "ADMIN"),
  TournamentController.create,
);
tournamentsRouter.post("/:tournamentId/register", TournamentController.register);
tournamentsRouter.delete("/:tournamentId/participants/me", TournamentController.withdraw);
tournamentsRouter.post(
  "/:tournamentId/invitation-links/redeem",
  TournamentController.redeemInvitationLink,
);
tournamentsRouter.post(
  "/:tournamentId/invitation-links",
  requireRole("ORGANIZER", "ADMIN"),
  TournamentController.createInvitationLink,
);
tournamentsRouter.get(
  "/:tournamentId/invitation-links",
  requireRole("ORGANIZER", "ADMIN"),
  TournamentController.listInvitationLinks,
);
tournamentsRouter.delete(
  "/:tournamentId/invitation-links/:linkId",
  requireRole("ORGANIZER", "ADMIN"),
  TournamentController.revokeInvitationLink,
);
tournamentsRouter.post(
  "/:tournamentId/registration/open",
  requireRole("ORGANIZER", "ADMIN"),
  TournamentController.openRegistration,
);
tournamentsRouter.post(
  "/:tournamentId/registration/close",
  requireRole("ORGANIZER", "ADMIN"),
  TournamentController.closeRegistration,
);
tournamentsRouter.post(
  "/:tournamentId/start",
  requireRole("ORGANIZER", "ADMIN"),
  TournamentController.start,
);
tournamentsRouter.post(
  "/:tournamentId/rounds/next",
  requireRole("ORGANIZER", "ADMIN"),
  TournamentController.advanceRound,
);
tournamentsRouter.post(
  "/:tournamentId/cancel",
  requireRole("ORGANIZER", "ADMIN"),
  TournamentController.cancel,
);

export default tournamentsRouter;
