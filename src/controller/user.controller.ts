import type { RequestHandler } from "express";
import type { UploadedFile } from "express-fileupload";
import { UserService } from "../service/userService";
import { StatisticsService } from "../service/statisticsService";
import { getUserAchievements } from "../service/achievementService";
import { RatingService } from "../service/ratingService";
import { TrainingRatingService } from "../service/trainingRatingService";
import {
  readBody,
  readParamId,
  readString,
  requireAdmin,
  requireCurrentUser,
} from "./controller.utils";

export const UserController = {
  getPublicProfile: (async (request, response) => {
    response.status(200).json(await UserService.getPublicProfile(
      readParamId(request, "userId"),
    ));
  }) satisfies RequestHandler,

  searchUsers: (async (request, response) => {
    const username = request.query.username;
    if (typeof username !== "string") {
      response.status(422).json({ success: false, message: "Pseudonyme de recherche requis." });
      return;
    }
    response.status(200).json(await UserService.searchActiveUsers(username));
  }) satisfies RequestHandler,

  getAllUsers: (async (_request, response) => {
    requireAdmin(response);
    response.status(200).json(await UserService.getAllUsers());
  }) satisfies RequestHandler,

  getUserById: (async (request, response) => {
    const user = requireCurrentUser(response);
    const userId = readParamId(request, "userId");
    if (user.role !== "ADMIN" && user.id !== userId) {
      response.status(403).json({ success: false, message: "Accès interdit." });
      return;
    }
    response.status(200).json(await UserService.getUserById(userId));
  }) satisfies RequestHandler,

  getMyStatistics: (async (_request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await StatisticsService.getForUser(user.id));
  }) satisfies RequestHandler,

  getMe: (async (_request, response) => {
    const user = requireCurrentUser(response);
    const { data } = await UserService.getUserById(user.id);
    response.status(200).json({ user: data });
  }) satisfies RequestHandler,

  getMyRatings: (async (_request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await RatingService.getForUser(user.id));
  }) satisfies RequestHandler,

  getMyTrainingRating: (async (_request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await TrainingRatingService.getForUser(user.id));
  }) satisfies RequestHandler,

  completeTrainingLesson: (async (request, response) => {
    const user = requireCurrentUser(response);
    const lessonId = request.params.lessonId;
    if (typeof lessonId !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(lessonId)) {
      response.status(422).json({ success: false, message: "Identifiant de leçon invalide." });
      return;
    }
    const moves = readBody(request).moves;
    if (!Array.isArray(moves) || !moves.every((move) => typeof move === "string")) {
      response.status(422).json({ success: false, message: "La progression de la leçon est invalide." });
      return;
    }
    response.status(200).json(await TrainingRatingService.completeLesson(user.id, lessonId, moves));
  }) satisfies RequestHandler,

  getMyAchievements: (async (_request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await getUserAchievements(user.id));
  }) satisfies RequestHandler,

  changeUserRole: (async (request, response) => {
    const actor = requireAdmin(response);
    const userId = readParamId(request, "userId");
    const role = readString(readBody(request), "role");
    if (role !== "USER" && role !== "ORGANIZER" && role !== "ADMIN") {
      response.status(422).json({ success: false, message: "Rôle invalide." });
      return;
    }
    response.status(200).json(await UserService.changeUserRole(actor.id, userId, role));
  }) satisfies RequestHandler,

  changeUserEmail: (async (request, response) => {
    const user = requireCurrentUser(response);
    const email = readString(readBody(request), "email");
    response.status(200).json(await UserService.changeUserEmail(user.id, email));
  }) satisfies RequestHandler,

  confirmUserEmailChange: (async (request, response) => {
    const user = requireCurrentUser(response);
    const code = readString(readBody(request), "code");
    response.status(200).json(await UserService.confirmUserEmailChange(user.id, code));
  }) satisfies RequestHandler,

  changeUsername: (async (request, response) => {
    const user = requireCurrentUser(response);
    const username = readString(readBody(request), "username");
    response.status(200).json(await UserService.changeUsername(user.id, username));
  }) satisfies RequestHandler,

  changeUserStatus: (async (request, response) => {
    requireAdmin(response);
    const userId = readParamId(request, "userId");
    const status = readString(readBody(request), "status");
    if (status !== "ACTIVE" && status !== "INACTIVE" && status !== "SUSPENDED") {
      response.status(422).json({ success: false, message: "Statut invalide." });
      return;
    }
    response.status(200).json(await UserService.changeUserStatus(userId, status));
  }) satisfies RequestHandler,

  changeUserAvatar: (async (request, response) => {
    const user = requireCurrentUser(response);
    const files = request.files;
    const avatar = files && !Array.isArray(files.avatar) ? files.avatar : undefined;
    if (!avatar) {
      response.status(400).json({ success: false, message: "Fichier d'avatar manquant." });
      return;
    }
    response.status(200).json(await UserService.changeUserAvatar(user.id, avatar as UploadedFile));
  }) satisfies RequestHandler,

  markUserForDeletion: (async (_request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await UserService.markUserForDeletion(user.id));
  }) satisfies RequestHandler,

  restoreDeletedUser: (async (request, response) => {
    const actor = requireAdmin(response);
    const userId = readParamId(request, "userId");
    response.status(200).json(await UserService.restoreDeletedUser(actor.id, userId));
  }) satisfies RequestHandler,

  permanentlyDeleteUser: (async (request, response) => {
    const actor = requireAdmin(response);
    const userId = readParamId(request, "userId");
    response.status(200).json(await UserService.permanentlyDeleteUser(actor.id, userId));
  }) satisfies RequestHandler,
};
