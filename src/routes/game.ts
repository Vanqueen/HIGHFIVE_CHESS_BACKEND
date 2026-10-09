import { Router } from "express";
import { GameController } from "../controller/game.controller";
import { authenticate } from "../middlewares/auth.middleware";

const gameRouter = Router();

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
gameRouter.get("/:gameId/clock", GameController.getClock);
gameRouter.get("/:gameId/messages", GameController.getMessages);
gameRouter.post("/:gameId/messages", GameController.sendMessage);
gameRouter.get("/:gameId", GameController.getGame);

export default gameRouter;