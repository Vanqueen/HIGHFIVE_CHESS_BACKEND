import { Router } from "express";
import { AuthController } from "../controller/auth.controller";
import { PasswordResetController } from "../controller/passwordReset.controller";
import { authenticate, requireRole } from "../middlewares/auth.middleware";

const authRouter = Router();

authRouter.post("/register", AuthController.register);
authRouter.post("/login", AuthController.login);
authRouter.post("/refresh", AuthController.refresh);
authRouter.post("/logout", authenticate, AuthController.logout);
authRouter.post("/unlock/:userId", authenticate, requireRole("ADMIN"), AuthController.unlockUser);

authRouter.post("/password/forgot", PasswordResetController.forgotPassword);
authRouter.post("/password/verify-reset-code", PasswordResetController.verifyResetCode);
authRouter.post("/password/reset", PasswordResetController.resetPassword);
authRouter.post("/password/change", authenticate, PasswordResetController.changePassword);

export default authRouter;