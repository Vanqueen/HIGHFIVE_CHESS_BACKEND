import { Router } from "express";
import { GameController } from "../controller/game.controller";
import { authenticate } from "../middlewares/auth.middleware";

const gameRouter = Router();

gameRouter.use(authenticate);
gameRouter.post("/", GameController.createGame);
gameRouter.get("/me", GameController.getGamesForCurrentUser);
gameRouter.post("/:gameId/moves", GameController.playMove);
gameRouter.get("/:gameId/moves", GameController.getMoves);
gameRouter.get("/:gameId", GameController.getGame);

export default gameRouter;