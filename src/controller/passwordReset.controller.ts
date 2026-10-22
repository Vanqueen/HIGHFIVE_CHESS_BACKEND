import type { RequestHandler } from "express";
import { PasswordResetService } from "../service/passwordResetService";
import {
  readBody,
  readPositiveInteger,
  readString,
  requireCurrentUser,
} from "./controller.utils";

export const PasswordResetController = {
  changePassword: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = readBody(request);
    response.status(200).json(await PasswordResetService.changePassword(
      user.id,
      readString(body, "currentPassword"),
      readString(body, "newPassword"),
    ));
  }) satisfies RequestHandler,

  forgotPassword: (async (request, response) => {
    const email = readString(readBody(request), "email");
    response.status(200).json(await PasswordResetService.forgotPassword(email));
  }) satisfies RequestHandler,

  verifyResetCode: (async (request, response) => {
    const body = readBody(request);
    response.status(200).json(await PasswordResetService.verifyResetCode(
      readPositiveInteger(body, "userId"),
      readString(body, "code"),
    ));
  }) satisfies RequestHandler,

  resetPassword: (async (request, response) => {
    const body = readBody(request);
    response.status(200).json(await PasswordResetService.resetPassword(
      readPositiveInteger(body, "userId"),
      readString(body, "code"),
      readString(body, "newPassword"),
    ));
  }) satisfies RequestHandler,
};