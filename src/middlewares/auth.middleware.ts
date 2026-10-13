import type { RequestHandler } from "express";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import { Temporal } from "temporal-polyfill";
import { findSession } from "../repository/session.repository";
import { findUser } from "../repository/user.repository";
import HttpError from "../service/errorService";

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: "USER" | "ORGANIZER" | "ADMIN";
  sessionId: number;
}

interface AccessTokenPayload extends JwtPayload {
  id: number;
  email: string;
  role: "USER" | "ORGANIZER" | "ADMIN";
  type: "access";
  sessionId: number;
}

function isAccessTokenPayload(payload: string | JwtPayload): payload is AccessTokenPayload {
  return typeof payload !== "string" &&
    Number.isSafeInteger(payload.id) &&
    (payload.id as number) > 0 &&
    typeof payload.email === "string" &&
    (payload.role === "USER" || payload.role === "ORGANIZER" || payload.role === "ADMIN") &&
    payload.type === "access" &&
    Number.isSafeInteger(payload.sessionId) &&
    (payload.sessionId as number) > 0;
}

export async function authenticateAccessToken(token: string): Promise<AuthenticatedUser> {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not configured");
  }

  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    throw new HttpError("Token invalide ou expiré.", 401, false);
  }
  if (!isAccessTokenPayload(decoded)) {
    throw new HttpError("Token invalide ou expiré.", 401, false);
  }

  const user = await findUser(decoded.id);
  if (
    !user ||
    user.email !== decoded.email ||
    user.role !== decoded.role ||
    user.deletedAt !== null ||
    user.accountStatus !== "ACTIVE" ||
    (user.lockedUntil !== null &&
      user.lockedUntil.epochMilliseconds > Temporal.Now.instant().epochMilliseconds)
  ) {
    throw new HttpError("Compte indisponible.", 401, false);
  }

  const session = await findSession(decoded.sessionId);
  if (
    !session ||
    session.userId !== user.id ||
    session.revokedAt !== null ||
    session.expiresAt.epochMilliseconds <= Temporal.Now.instant().epochMilliseconds
  ) {
    throw new HttpError("Session expirée ou révoquée.", 401, false);
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    sessionId: session.id,
  };
}

function getBearerToken(header: string | undefined) {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

export const authenticate: RequestHandler = async (request, response, next) => {
  try {
    const token = getBearerToken(request.headers.authorization);
    if (!token) {
      throw new HttpError("Authentification requise.", 401, false);
    }

    const user = await authenticateAccessToken(token);
    response.locals.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const authenticateOptional: RequestHandler = async (request, response, next) => {
  try {
    const token = getBearerToken(request.headers.authorization);
    if (token) response.locals.user = await authenticateAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...roles: Array<"USER" | "ORGANIZER" | "ADMIN">): RequestHandler {
  return (_request, response, next) => {
    const user = response.locals.user as AuthenticatedUser | undefined;
    if (!user) {
      next(new HttpError("Authentification requise.", 401, false));
      return;
    }
    if (!roles.includes(user.role)) {
      next(new HttpError("Action non autorisée.", 403, false));
      return;
    }
    next();
  };
}
