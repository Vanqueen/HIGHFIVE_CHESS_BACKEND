import type { RequestHandler } from "express";
import { AuthService } from "../service/authService";
import { requireAdmin, requireCurrentUser, readBody, readParamId, readString } from "./controller.utils";
import HttpError from "../service/errorService";

export const AuthController = {
  register: (async (request, response) => {
    const body = readBody(request);
    const result = await AuthService.register({
      username: readString(body, "username"),
      email: readString(body, "email"),
      password: readString(body, "password"),
      role: "USER",
    });
    response.status(201).json(result);
  }) satisfies RequestHandler,

  createPrivilegedUser: (async (request, response) => {
    requireAdmin(response);
    const body = readBody(request);
    const role = readString(body, "role");
    if (role !== "ADMIN" && role !== "ORGANIZER") {
      throw new HttpError("Le rôle doit être ADMIN ou ORGANIZER.", 422, false);
    }
    const result = await AuthService.register({
      username: readString(body, "username"),
      email: readString(body, "email"),
      password: readString(body, "password"),
      role,
    });
    response.status(201).json(result);
  }) satisfies RequestHandler,

  login: (async (request, response) => {
    const body = readBody(request);
    const result = await AuthService.login(
      readString(body, "email"),
      readString(body, "password"),
    );
    response.status(200).json(result);
  }) satisfies RequestHandler,

  refresh: (async (request, response) => {
    const body = readBody(request);
    const result = await AuthService.refresh(readString(body, "refreshToken"));
    response.status(200).json(result);
  }) satisfies RequestHandler,

  logout: (async (_request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await AuthService.logout(user.id));
  }) satisfies RequestHandler,

  unlockUser: (async (request, response) => {
    requireAdmin(response);
    const userId = readParamId(request, "userId");
    response.status(200).json(await AuthService.unlockUser(userId));
  }) satisfies RequestHandler,
};