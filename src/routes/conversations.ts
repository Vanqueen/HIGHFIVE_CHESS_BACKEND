import { Router } from "express";
import { ConversationController } from "../controller/conversation.controller";
import { authenticate } from "../middlewares/auth.middleware";

const conversationsRouter = Router();

conversationsRouter.use(authenticate);

// Routes existantes
conversationsRouter.get("/me", ConversationController.getMine);
conversationsRouter.post("/direct", ConversationController.openDirect);

// Nouvelles routes pour la messagerie
conversationsRouter.get("/:conversationId", ConversationController.getConversationInfo);
conversationsRouter.get("/:conversationId/messages", ConversationController.getMessages);
conversationsRouter.post("/:conversationId/messages", ConversationController.sendMessage);
conversationsRouter.post("/:conversationId/read", ConversationController.markAsRead);

// Routes pour la gestion des messages
conversationsRouter.put("/messages/:messageId", ConversationController.editMessage);
conversationsRouter.delete("/messages/:messageId", ConversationController.deleteMessage);

export default conversationsRouter;
