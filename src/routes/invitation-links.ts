import { Router } from "express";
import { InvitationLinkController } from "../controller/invitation-link.controller";
import { authenticateOptional } from "../middlewares/auth.middleware";

const invitationLinksRouter = Router();

invitationLinksRouter.post("/anonymous", InvitationLinkController.createAnonymousGame);
invitationLinksRouter.post(
  "/anonymous/redeem",
  authenticateOptional,
  InvitationLinkController.joinAnonymousGame,
);
invitationLinksRouter.post("/redeem", authenticateOptional, InvitationLinkController.redeem);

export default invitationLinksRouter;
