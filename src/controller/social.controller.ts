import type { RequestHandler } from "express";
import { readParamId, requireCurrentUser } from "./controller.utils";
import { SocialService } from "../service/socialService";

export const SocialController = {
  getFriendships: (async (_request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await SocialService.getFriendships(user.id));
  }) satisfies RequestHandler,

  requestFriendship: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(201).json(await SocialService.requestFriendship(
      user.id,
      readParamId(request, "userId"),
    ));
  }) satisfies RequestHandler,

  acceptFriendship: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await SocialService.acceptFriendship(
      user.id,
      readParamId(request, "friendshipId"),
    ));
  }) satisfies RequestHandler,

  rejectFriendship: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await SocialService.rejectFriendship(
      user.id,
      readParamId(request, "friendshipId"),
    ));
  }) satisfies RequestHandler,

  removeFriendship: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await SocialService.removeFriendship(
      user.id,
      readParamId(request, "friendshipId"),
    ));
  }) satisfies RequestHandler,

  getBlockedUsers: (async (_request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await SocialService.getBlockedUsers(user.id));
  }) satisfies RequestHandler,

  blockUser: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(201).json(await SocialService.blockUser(
      user.id,
      readParamId(request, "userId"),
    ));
  }) satisfies RequestHandler,

  unblockUser: (async (request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await SocialService.unblockUser(
      user.id,
      readParamId(request, "userId"),
    ));
  }) satisfies RequestHandler,
};
