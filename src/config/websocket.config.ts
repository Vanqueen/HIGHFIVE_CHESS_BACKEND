import type { ServerOptions } from "socket.io";
import { getAllowedClientOrigins } from "./http-security.config";

export function getWebSocketConfig(env: NodeJS.ProcessEnv = process.env) {
  const allowedOrigins = getAllowedClientOrigins(env);

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
