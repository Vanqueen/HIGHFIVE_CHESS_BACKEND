import { Router } from "express";
import { SocialController } from "../controller/social.controller";
import { authenticate } from "../middlewares/auth.middleware";

const socialRouter = Router();

socialRouter.use(authenticate);
socialRouter.get("/friendships/me", SocialController.getFriendships);
socialRouter.post("/friendships/:userId", SocialController.requestFriendship);
socialRouter.post("/friendships/:friendshipId/accept", SocialController.acceptFriendship);
socialRouter.post("/friendships/:friendshipId/reject", SocialController.rejectFriendship);
socialRouter.delete("/friendships/:friendshipId", SocialController.removeFriendship);
socialRouter.get("/blocked-users/me", SocialController.getBlockedUsers);
socialRouter.post("/blocked-users/:userId", SocialController.blockUser);
socialRouter.delete("/blocked-users/:userId", SocialController.unblockUser);

export default socialRouter;
