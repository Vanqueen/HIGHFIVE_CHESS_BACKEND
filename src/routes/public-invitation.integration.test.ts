import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { errorHandler } from "../middlewares/error.middleware";
import invitationLinksRouter from "./invitation-links";
import socialRouter from "./social";

describe("social and public invitation route mounting", () => {
  let server: ReturnType<typeof createServer> | undefined;

  afterEach(async () => {
    if (!server?.listening) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    server = undefined;
  });

  it("keeps anonymous game creation public without making social endpoints public", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", socialRouter);
    app.use("/api/invitation-links", invitationLinksRouter);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port.");
    }
    const baseUrl = `http://127.0.0.1:${address.port}/api`;

    const publicResponse = await fetch(`${baseUrl}/invitation-links/anonymous`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initialTimeSeconds: -1, incrementSeconds: 0 }),
    });
    expect(publicResponse.status).toBe(422);
    await expect(publicResponse.json()).resolves.toMatchObject({
      message: "Contrôle du temps invalide.",
    });

    const protectedResponse = await fetch(`${baseUrl}/social/friendships/me`);
    expect(protectedResponse.status).toBe(401);
    await expect(protectedResponse.json()).resolves.toMatchObject({
      message: "Authentification requise.",
    });
  });
});
