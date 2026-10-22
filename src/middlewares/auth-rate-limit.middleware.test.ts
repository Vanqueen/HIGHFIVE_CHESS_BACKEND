import { createServer } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loginRateLimit } from "./auth-rate-limit.middleware";

describe("authentication rate limits", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.post("/login", loginRateLimit, (_request, response) => {
      response.sendStatus(204);
    });
    server = createServer(app);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Impossible de déterminer le port du test.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it("returns HTTP 429 after the configured login attempt limit", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`${baseUrl}/login`, { method: "POST" });
      expect(response.status).toBe(204);
    }

    const limitedResponse = await fetch(`${baseUrl}/login`, { method: "POST" });
    expect(limitedResponse.status).toBe(429);
    expect(await limitedResponse.json()).toEqual({
      success: false,
      message: "Trop de requêtes. Réessayez plus tard.",
    });
  });
});
