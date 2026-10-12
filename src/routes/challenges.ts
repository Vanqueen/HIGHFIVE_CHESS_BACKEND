import { Router } from "express";
import { ChallengeController } from "../controller/challenge.controller";
import { InvitationLinkController } from "../controller/invitation-link.controller";
import { authenticate } from "../middlewares/auth.middleware";

const challengesRouter = Router();

// Every challenge operation is private to an authenticated account.
challengesRouter.use(authenticate);
challengesRouter.post("/", ChallengeController.create);
challengesRouter.get("/me", ChallengeController.getMine);
challengesRouter.post("/:challengeId/invitation-links", InvitationLinkController.createForChallenge);
challengesRouter.get("/:challengeId/invitation-links", InvitationLinkController.listForChallenge);
challengesRouter.delete(
  "/:challengeId/invitation-links/:linkId",
  InvitationLinkController.revokeForChallenge,
);
challengesRouter.post("/:challengeId/accept", ChallengeController.accept);
challengesRouter.post("/:challengeId/decline", ChallengeController.decline);
challengesRouter.post("/:challengeId/cancel", ChallengeController.cancel);

export default challengesRouter;
