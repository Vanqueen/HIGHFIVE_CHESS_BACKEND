import { describe, expect, it } from "vitest";
import { getWebSocketConfig } from "./websocket.config";

describe("getWebSocketConfig", () => {
  it("uses configured origins and keeps timing and payload limits centralized", () => {
    const config = getWebSocketConfig({
      NODE_ENV: "production",
      CLIENT_ORIGINS: "https://chess.example, https://admin.example ",
    });

    expect(config).toMatchObject({
      cors: {
        origin: ["https://chess.example", "https://admin.example"],
        methods: ["GET", "POST"],
      },
      maxHttpBufferSize: 1_000_000,
      clockUpdateIntervalMs: 1_000,
      sessionValidationIntervalMs: 30_000,
    });
  });

  it("uses the local client origin by default outside production", () => {
    expect(getWebSocketConfig({ NODE_ENV: "development" }).cors.origin)
      .toEqual(["http://localhost:5173"]);
  });
});
