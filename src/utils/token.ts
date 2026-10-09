import jwt from "jsonwebtoken";
import argon2 from "argon2";
import crypto from "node:crypto";

export const generateToken = (
    user: { id: number; email: string; role: string }, 
    type: "access" | "refresh",
    JWT_SECRET: string,
    JWT_EXPIRES_IN: number,
  ) => {
  // type = access or refresh
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    type: type,
  };
  try {
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return token;
  } catch (error) {
    console.error("Erreur lors de la génération du token:", error);
    throw error;
  }
};

export const generateRefreshToken = (
  user: { id: number; email: string; role: string },
  JWT_REFRESH_SECRET: string,
  JWT_REFRESH_EXPIRES_IN: number
) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    type: "refresh",
  };
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
};

export const verifyToken = (token: string, secret: string) => {
  try {
    const decoded = jwt.verify(token, secret);
    return decoded;
  } catch (error) {
    console.error("Erreur lors de la vérification du token:", error);
    return null;
  }
};

export const generateSecret = () => {
  return crypto.randomBytes(64).toString("hex");
};

export const hashToken = async (token: string) => {
  try {
    const hashedPassword = await argon2.hash(token, { type: argon2.argon2id });
    return hashedPassword;
  } catch (error) {
    console.error("Erreur lors du hachage du token :", error);
    throw error;
  }
};

export const decodeToken = async (hashToken: string, plainToken: string) => {
  if (!hashToken || !plainToken) return null;
  try {
    const decoded = await argon2.verify(hashToken, plainToken);
    console.log("decoded : ", decoded);
    if (!decoded) return null;
    return decoded;
  } catch (error) {
    console.error(`Erreur lors de la vérification du token :`, error);
    return null;
  }
};

export function tokenExpires(hours = 1) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function refreshTokenExpires(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
