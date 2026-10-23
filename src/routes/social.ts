import { Router } from "express";
import { SocialController } from "../controller/social.controller";
import { authenticate } from "../middlewares/auth.middleware";

const socialRouter = Router();

socialRouter.get("/friendships/me", authenticate, SocialController.getFriendships);
socialRouter.post("/friendships/:userId", authenticate, SocialController.requestFriendship);
socialRouter.post("/friendships/:friendshipId/accept", authenticate, SocialController.acceptFriendship);
socialRouter.post("/friendships/:friendshipId/reject", authenticate, SocialController.rejectFriendship);
socialRouter.delete("/friendships/:friendshipId", authenticate, SocialController.removeFriendship);
socialRouter.get("/blocked-users/me", authenticate, SocialController.getBlockedUsers);
socialRouter.post("/blocked-users/:userId", authenticate, SocialController.blockUser);
socialRouter.delete("/blocked-users/:userId", authenticate, SocialController.unblockUser);

export default socialRouter;
