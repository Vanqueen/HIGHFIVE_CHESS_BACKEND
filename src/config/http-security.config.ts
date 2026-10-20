import type { CorsOptions } from "cors";
import { nodeEnv } from "./environment";

export function getAllowedClientOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const defaultOrigins = (env.NODE_ENV ?? nodeEnv) === "production"
    ? ""
    : "http://localhost:5173";

  return [...new Set((env.CLIENT_ORIGINS ?? defaultOrigins)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      let parsedOrigin: URL;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        throw new Error("CLIENT_ORIGINS doit contenir des origines HTTP ou HTTPS valides.");
      }

      if (
        !["http:", "https:"].includes(parsedOrigin.protocol)
        || parsedOrigin.username
        || parsedOrigin.password
        || parsedOrigin.pathname !== "/"
        || parsedOrigin.search
        || parsedOrigin.hash
      ) {
        throw new Error("CLIENT_ORIGINS doit contenir uniquement des origines HTTP ou HTTPS.");
      }

      return parsedOrigin.origin;
    }))];
}

export function isClientOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}

export function getCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const allowedOrigins = getAllowedClientOrigins(env);

  return {
    origin: (origin, callback) => {
      callback(null, isClientOriginAllowed(origin, allowedOrigins));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-TOKEN"],
    exposedHeaders: ["Authorization"],
    credentials: true,
    maxAge: 600,
  };
}

export function getTrustedProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const rawValue = env.TRUST_PROXY_HOPS?.trim();
  if (!rawValue) return 0;

  if (!/^\d+$/.test(rawValue)) {
    throw new Error("TRUST_PROXY_HOPS doit être un entier positif ou nul.");
  }

  const hops = Number(rawValue);
  if (!Number.isSafeInteger(hops)) {
    throw new Error("TRUST_PROXY_HOPS dépasse la valeur maximale autorisée.");
  }

  return hops;
}
