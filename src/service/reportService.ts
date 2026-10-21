import {
  createReport,
  findReport,
  findReportsByReporter,
  findReportsByStatus,
  reviewReport,
} from "../repository/report.repository";
import { findGameParticipantsByGameId } from "../repository/game-participant.repository";
import { findConversationParticipants } from "../repository/conversation.repository";
import { findMessage } from "../repository/message.repository";
import { findGame } from "../repository/game.repository";
import { findUser } from "../repository/user.repository";
import { hasAffectedRows } from "../repository/affected-rows";
import { toTemporal } from "../utils/temporalDate.ts";
import HttpError, { rethrowServiceError } from "./errorService";

const REPORT_REASONS = [
  "CHEATING",
  "HARASSMENT",
  "INSULT",
  "SPAM",
  "INAPPROPRIATE_CONTENT",
  "FAKE_ACCOUNT",
  "OTHER",
] as const;

export type ReportReason = typeof REPORT_REASONS[number];
export type ReportStatus = "PENDING" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";

export function isReportReason(value: string): value is ReportReason {
  return REPORT_REASONS.includes(value as ReportReason);
}

export function isReportStatus(value: string): value is ReportStatus {
  return ["PENDING", "UNDER_REVIEW", "RESOLVED", "REJECTED"].includes(value);
}

export interface CreateReportInput {
  reportedUserId?: number;
  gameId?: number;
  messageId?: number;
  reason: ReportReason;
  description?: string;
}

export class ReportService {
  static async listMine(reporterId: number, limit: number) {
    try {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new HttpError("La limite doit être comprise entre 1 et 100.", 422, false);
      }
      return findReportsByReporter(reporterId, limit);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération de vos signalements :");
    }
  }

  static async create(reporterId: number, input: CreateReportInput) {
    try {
      if (!isReportReason(input.reason)) {
        throw new HttpError("Motif de signalement invalide.", 422, false);
      }
      const targets = [input.reportedUserId, input.gameId, input.messageId]
        .filter((value) => value !== undefined);
      if (targets.length === 0) {
        throw new HttpError("Un utilisateur, une partie ou un message doit être signalé.", 422, false);
      }
      if (input.gameId !== undefined && input.messageId !== undefined) {
        throw new HttpError("Un signalement ne peut cibler qu'une partie ou un message.", 422, false);
      }
      if (input.description !== undefined &&
        (typeof input.description !== "string" || input.description.trim().length > 2000)) {
        throw new HttpError("La description ne peut pas dépasser 2000 caractères.", 422, false);
      }

      let reportedUserId = input.reportedUserId;
      if (reportedUserId !== undefined) {
        if (reportedUserId === reporterId) {
          throw new HttpError("Vous ne pouvez pas vous signaler vous-même.", 422, false);
        }
        const reportedUser = await findUser(reportedUserId);
        if (!reportedUser || reportedUser.deletedAt !== null) {
          throw new HttpError("Utilisateur signalé introuvable.", 404, false);
        }
      }

      if (input.gameId !== undefined) {
        if (!await findGame(input.gameId)) {
          throw new HttpError("Partie signalée introuvable.", 404, false);
        }
        const participants = await findGameParticipantsByGameId(input.gameId);
        if (!participants.some((participant) =>
          participant.userId === reporterId && participant.participantType === "USER"
        )) {
          throw new HttpError("Seul un participant peut signaler une partie.", 403, false);
        }
        if (
          reportedUserId !== undefined &&
          !participants.some((participant) => participant.userId === reportedUserId)
        ) {
          throw new HttpError("L'utilisateur signalé ne participe pas à cette partie.", 422, false);
        }
      }

      if (input.messageId !== undefined) {
        const message = await findMessage(input.messageId);
        if (!message || message.deletedAt !== null) {
          throw new HttpError("Message signalé introuvable.", 404, false);
        }
        const participants = await findConversationParticipants(message.conversationId);
        if (!participants.some((participant) => participant.userId === reporterId)) {
          throw new HttpError("Seul un participant peut signaler ce message.", 403, false);
        }
        if (message.senderId === reporterId) {
          throw new HttpError("Vous ne pouvez pas signaler votre propre message.", 422, false);
        }
        if (reportedUserId !== undefined && reportedUserId !== message.senderId) {
          throw new HttpError("L'utilisateur signalé n'est pas l'auteur du message.", 422, false);
        }
        reportedUserId = message.senderId;
      }

      return await createReport({
        reporterId,
        reportedUserId: reportedUserId ?? null,
        gameId: input.gameId ?? null,
        messageId: input.messageId ?? null,
        reason: input.reason,
        description: input.description?.trim() || null,
      });
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la création du signalement :");
    }
  }

  static async listForAdmin(status: ReportStatus, limit: number) {
    try {
      if (!isReportStatus(status)) {
        throw new HttpError("Statut de signalement invalide.", 422, false);
      }
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new HttpError("La limite doit être comprise entre 1 et 100.", 422, false);
      }
      return findReportsByStatus(status, limit);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des signalements :");
    }
  }

  static async review(
    reportId: number,
    reviewerId: number,
    status: ReportStatus,
    resolutionNote?: string,
  ) {
    try {
      if (status !== "UNDER_REVIEW" && status !== "RESOLVED" && status !== "REJECTED") {
        throw new HttpError("Statut de revue invalide.", 422, false);
      }
      if (resolutionNote !== undefined &&
        (typeof resolutionNote !== "string" || resolutionNote.trim().length > 2000)) {
        throw new HttpError("La note de revue ne peut pas dépasser 2000 caractères.", 422, false);
      }
      const report = await findReport(reportId);
      if (!report) throw new HttpError("Signalement introuvable.", 404, false);
      if (report.status !== "PENDING" && report.status !== "UNDER_REVIEW") {
        throw new HttpError("Ce signalement a déjà été clôturé.", 409, false);
      }

      const updated = await reviewReport(reportId, report.status, {
        status,
        reviewedById: reviewerId,
        reviewedAt: toTemporal(new Date()),
        resolutionNote: resolutionNote?.trim() || null,
      });
      if (!hasAffectedRows(updated)) {
        throw new HttpError("Le signalement a été modifié par un autre administrateur.", 409, false);
      }
      return updated;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la revue du signalement :");
    }
  }
}
