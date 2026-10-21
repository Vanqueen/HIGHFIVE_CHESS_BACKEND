import { Router } from "express";
import { UserController } from "../controller/user.controller";
import { authenticate, requireRole } from "../middlewares/auth.middleware";

const usersRouter = Router();

usersRouter.get("/public/:userId", UserController.getPublicProfile);
usersRouter.use(authenticate);

usersRouter.get("/", requireRole("ADMIN"), UserController.getAllUsers);
usersRouter.get("/search", UserController.searchUsers);
usersRouter.get("/me/statistics", UserController.getMyStatistics);
usersRouter.get("/me/achievements", UserController.getMyAchievements);
usersRouter.get("/me", authenticate, async (req, res) => {
  try {
    const authenticatedReq = req as typeof req & { user: unknown };
    res.status(200).json({ user: authenticatedReq.user });
  } catch (err) {
    res.status(500).json({
      message: err instanceof Error ? err.message : "Internal server error",
    });
  }
});
usersRouter.get("/:userId", UserController.getUserById);
usersRouter.patch("/:userId/role", requireRole("ADMIN"), UserController.changeUserRole);
usersRouter.patch("/me/email", UserController.changeUserEmail);
usersRouter.post("/me/email/confirm", UserController.confirmUserEmailChange);
usersRouter.patch("/me/username", UserController.changeUsername);
usersRouter.patch("/:userId/status", requireRole("ADMIN"), UserController.changeUserStatus);
usersRouter.patch("/me/avatar", UserController.changeUserAvatar);
usersRouter.delete("/me", UserController.markUserForDeletion);
usersRouter.post("/:userId/restore", requireRole("ADMIN"), UserController.restoreDeletedUser);
usersRouter.delete("/:userId/permanent", requireRole("ADMIN"), UserController.permanentlyDeleteUser);

export default usersRouter;