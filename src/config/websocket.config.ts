import type { ServerOptions } from "socket.io";
import { nodeEnv } from "./environment";

export function getWebSocketConfig(env: NodeJS.ProcessEnv = process.env) {
  const defaultOrigins = (env.NODE_ENV ?? nodeEnv) === "production"
    ? ""
    : "http://localhost:5173";
  const allowedOrigins = (env.CLIENT_ORIGINS ?? defaultOrigins)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const socketOptions: Partial<ServerOptions> = {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 1_000_000,
  };

  return {
    ...socketOptions,
    clockUpdateIntervalMs: 1_000,
    sessionValidationIntervalMs: 30_000,
  };
}
