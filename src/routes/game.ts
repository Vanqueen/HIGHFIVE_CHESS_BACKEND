import { Router } from "express";
import { GameController } from "../controller/game.controller";
import { GameAnalysisController } from "../controller/game-analysis.controller";
import { authenticate } from "../middlewares/auth.middleware";

const gameRouter = Router();

gameRouter.post("/guest/:gameId/moves", GameController.playGuestMove);
gameRouter.post("/guest/:gameId/draw-offers", GameController.offerDrawAsGuest);
gameRouter.post("/guest/:gameId/draw-offers/respond", GameController.respondToDrawAsGuest);
gameRouter.post("/guest/:gameId/undo-requests", GameController.requestUndoAsGuest);
gameRouter.post("/guest/:gameId/undo-requests/respond", GameController.respondToUndoAsGuest);
gameRouter.post("/guest/:gameId/resign", GameController.resignAsGuest);
gameRouter.post("/guest/:gameId/no-show", GameController.claimNoShowAsGuest);
gameRouter.get("/guest/:gameId/moves", GameController.getGuestMoves);
gameRouter.get("/guest/:gameId/messages", GameController.getGuestMessages);
gameRouter.get("/guest/:gameId/notifications", GameController.getGuestNotifications);
gameRouter.post("/guest/:gameId/messages", GameController.sendGuestMessage);
gameRouter.use(authenticate);
gameRouter.post("/", GameController.createGame);
gameRouter.get("/me", GameController.getGamesForCurrentUser);
gameRouter.post("/:gameId/moves", GameController.playMove);
gameRouter.get("/:gameId/moves", GameController.getMoves);
gameRouter.post("/:gameId/draw-offers", GameController.offerDraw);
gameRouter.post("/:gameId/draw-offers/respond", GameController.respondToDraw);
gameRouter.post("/:gameId/undo-requests", GameController.requestUndo);
gameRouter.post("/:gameId/undo-requests/respond", GameController.respondToUndo);
gameRouter.post("/:gameId/resign", GameController.resign);
gameRouter.post("/:gameId/no-show", GameController.claimNoShow);
gameRouter.get("/:gameId/clock", GameController.getClock);
gameRouter.get("/:gameId/analysis", GameAnalysisController.get);
gameRouter.post("/:gameId/analysis", GameAnalysisController.request);
gameRouter.get("/:gameId/messages", GameController.getMessages);
gameRouter.post("/:gameId/messages", GameController.sendMessage);
gameRouter.get("/:gameId", GameController.getGame);

export default gameRouter;