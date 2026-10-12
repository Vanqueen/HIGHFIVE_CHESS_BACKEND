import { Router } from "express";
import { AuthController } from "../controller/auth.controller";
import { PasswordResetController } from "../controller/passwordReset.controller";
import { authenticate, requireRole } from "../middlewares/auth.middleware";
import {
  adminUnlockRateLimit,
  loginRateLimit,
  passwordChangeRateLimit,
  passwordRecoveryRateLimit,
  refreshRateLimit,
  registrationRateLimit,
} from "../middlewares/auth-rate-limit.middleware";

const authRouter = Router();

authRouter.post("/register", registrationRateLimit, AuthController.register);
authRouter.post("/login", loginRateLimit, AuthController.login);
authRouter.post("/refresh", refreshRateLimit, AuthController.refresh);
authRouter.post("/logout", authenticate, AuthController.logout);
authRouter.post(
  "/unlock/:userId",
  adminUnlockRateLimit,
  authenticate,
  requireRole("ADMIN"),
  AuthController.unlockUser,
);

authRouter.post("/password/forgot", passwordRecoveryRateLimit, PasswordResetController.forgotPassword);
authRouter.post(
  "/password/verify-reset-code",
  passwordRecoveryRateLimit,
  PasswordResetController.verifyResetCode,
);
authRouter.post("/password/reset", passwordRecoveryRateLimit, PasswordResetController.resetPassword);
authRouter.post(
  "/password/change",
  passwordChangeRateLimit,
  authenticate,
  PasswordResetController.changePassword,
);

export default authRouter;