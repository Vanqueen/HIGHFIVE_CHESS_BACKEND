import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const register = vi.hoisted(() => vi.fn());

vi.mock("../service/authService", () => ({
  AuthService: { register },
}));

import { AuthController } from "./auth.controller";

function makeResponse(user?: { id: number; role: string }) {
  return {
    locals: { user },
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

function makeRequest(body: Record<string, unknown>) {
  return { body, params: {} } as Request;
}

describe("AuthController account creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    register.mockResolvedValue({ success: true });
  });

  it("always creates a regular user through public registration", async () => {
    const response = makeResponse();

    await AuthController.register(
      makeRequest({
        username: "player",
        email: "player@example.test",
        password: "Password123",
        role: "ADMIN",
      }),
      response as unknown as Response,
    );

    expect(register).toHaveBeenCalledWith({
      username: "player",
      email: "player@example.test",
      password: "Password123",
      role: "USER",
    });
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it.each(["ADMIN", "ORGANIZER"] as const)(
    "allows an administrator to create a %s account",
    async (role) => {
      const response = makeResponse({ id: 1, role: "ADMIN" });

      await AuthController.createPrivilegedUser(
        makeRequest({
          username: "staff",
          email: "staff@example.test",
          password: "Password123",
          role,
        }),
        response as unknown as Response,
      );

      expect(register).toHaveBeenCalledWith({
        username: "staff",
        email: "staff@example.test",
        password: "Password123",
        role,
      });
      expect(response.status).toHaveBeenCalledWith(201);
    },
  );

  it("rejects privileged account creation by non-administrators", async () => {
    const response = makeResponse({ id: 2, role: "USER" });

    await expect(AuthController.createPrivilegedUser(
      makeRequest({
        username: "staff",
        email: "staff@example.test",
        password: "Password123",
        role: "ADMIN",
      }),
      response as unknown as Response,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(register).not.toHaveBeenCalled();
  });

  it("rejects USER as a privileged-account role", async () => {
    const response = makeResponse({ id: 1, role: "ADMIN" });

    await expect(AuthController.createPrivilegedUser(
      makeRequest({
        username: "staff",
        email: "staff@example.test",
        password: "Password123",
        role: "USER",
      }),
      response as unknown as Response,
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(register).not.toHaveBeenCalled();
  });
});
