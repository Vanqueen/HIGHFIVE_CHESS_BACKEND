import type { RequestHandler } from "express";
import { readBody, readParamId, requireAdmin, requireCurrentUser } from "./controller.utils";
import { ReportService, isReportReason, isReportStatus } from "../service/reportService";
import HttpError from "../service/errorService";

function optionalId(body: Record<string, unknown>, field: string): number | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(`Le champ ${field} doit être un identifiant positif.`, 422, false);
  }
  return value;
}

export const ReportController = {
  create: (async (request, response) => {
    const user = requireCurrentUser(response);
    const body = readBody(request);
    const reason = body.reason;
    if (typeof reason !== "string" || !isReportReason(reason)) {
      throw new HttpError("Motif de signalement invalide.", 422, false);
    }
    const description = body.description;
    if (description !== undefined && typeof description !== "string") {
      throw new HttpError("La description doit être du texte.", 422, false);
    }
    const reportedUserId = optionalId(body, "reportedUserId");
    const gameId = optionalId(body, "gameId");
    const messageId = optionalId(body, "messageId");
    const result = await ReportService.create(user.id, {
      reason,
      ...(reportedUserId !== undefined ? { reportedUserId } : {}),
      ...(gameId !== undefined ? { gameId } : {}),
      ...(messageId !== undefined ? { messageId } : {}),
      ...(description !== undefined ? { description } : {}),
    });
    response.status(201).json(result);
  }) satisfies RequestHandler,

  mine: (async (request, response) => {
    const user = requireCurrentUser(response);
    const limit = request.query.limit === undefined ? 50 : Number(request.query.limit);
    response.status(200).json(await ReportService.listMine(user.id, limit));
  }) satisfies RequestHandler,

  list: (async (request, response) => {
    requireAdmin(response);
    const status = typeof request.query.status === "string" ? request.query.status : "PENDING";
    if (!isReportStatus(status)) {
      throw new HttpError("Statut de signalement invalide.", 422, false);
    }
    const limit = request.query.limit === undefined ? 50 : Number(request.query.limit);
    response.status(200).json(await ReportService.listForAdmin(status, limit));
  }) satisfies RequestHandler,

  review: (async (request, response) => {
    const admin = requireAdmin(response);
    const body = readBody(request);
    const status = body.status;
    if (typeof status !== "string" || !isReportStatus(status)) {
      throw new HttpError("Statut de revue invalide.", 422, false);
    }
    const resolutionNote = body.resolutionNote;
    if (resolutionNote !== undefined && typeof resolutionNote !== "string") {
      throw new HttpError("La note de revue doit être du texte.", 422, false);
    }
    response.status(200).json(await ReportService.review(
      readParamId(request, "reportId"),
      admin.id,
      status,
      resolutionNote,
    ));
  }) satisfies RequestHandler,
};
