import { rateLimit } from "express-rate-limit";

const fifteenMinutes = 15 * 60 * 1000;
const oneHour = 60 * 60 * 1000;
const responseBody = {
  success: false,
  message: "Trop de requêtes. Réessayez plus tard.",
};

function createAuthRateLimit(limit: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: responseBody,
  });
}

export const authApiRateLimit = createAuthRateLimit(120, fifteenMinutes);
export const loginRateLimit = createAuthRateLimit(10, fifteenMinutes);
export const registrationRateLimit = createAuthRateLimit(5, oneHour);
export const refreshRateLimit = createAuthRateLimit(30, fifteenMinutes);
export const passwordRecoveryRateLimit = createAuthRateLimit(5, fifteenMinutes);
export const passwordChangeRateLimit = createAuthRateLimit(10, fifteenMinutes);
export const adminUnlockRateLimit = createAuthRateLimit(10, fifteenMinutes);
