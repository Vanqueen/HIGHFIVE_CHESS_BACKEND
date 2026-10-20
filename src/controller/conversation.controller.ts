import type { RequestHandler } from "express";
import { readBody, readPositiveInteger, requireCurrentUser, readString } from "./controller.utils";
import { ConversationService } from "../service/conversationService";
import { MessageService } from "../service/messageService";
import HttpError from "../service/errorService";

function readQueryInteger(value: unknown, fallback: number, field: string) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(`${field} invalide.`, 422, false);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new HttpError(`${field} invalide.`, 422, false);
  }
  return parsed;
}

export const ConversationController = {
  getMine: (async (_request, response) => {
    const user = requireCurrentUser(response);
    response.status(200).json(await ConversationService.getDirectConversations(user.id));
  }) satisfies RequestHandler,

  openDirect: (async (request, response) => {
    const user = requireCurrentUser(response);
    const otherUserId = readPositiveInteger(readBody(request), "userId");
    response.status(200).json(
      await ConversationService.openDirectConversation(user.id, otherUserId),
    );
  }) satisfies RequestHandler,

  sendMessage: (async (request, response) => {
    const user = requireCurrentUser(response);
    const conversationId = readPositiveInteger(request.params, "conversationId");
    const body = readBody(request);
    const content = readString(body, "content");

    if (body.messageType !== undefined && body.messageType !== "TEXT") {
      throw new HttpError("Type de message invalide.", 422, false);
    }
    response.status(201).json(
      await MessageService.sendMessage(conversationId, user.id, content),
    );
  }) satisfies RequestHandler,

  getMessages: (async (request, response) => {
    const user = requireCurrentUser(response);
    const conversationId = readPositiveInteger(request.params, "conversationId");
    const limit = readQueryInteger(request.query.limit, 50, "Limite");
    const beforeId = request.query.beforeId === undefined
      ? undefined
      : readQueryInteger(request.query.beforeId, 0, "Curseur");

    response.status(200).json(
      await MessageService.getMessages(conversationId, user.id, limit, beforeId),
    );
  }) satisfies RequestHandler,

  editMessage: (async (request, response) => {
    const user = requireCurrentUser(response);
    const messageId = readPositiveInteger(request.params, "messageId");
    const body = readBody(request);
    const content = readString(body, "content");

    response.status(200).json(
      await MessageService.editMessage(messageId, user.id, content),
    );
  }) satisfies RequestHandler,

  deleteMessage: (async (request, response) => {
    const user = requireCurrentUser(response);
    const messageId = readPositiveInteger(request.params, "messageId");

    response.status(200).json(
      await MessageService.deleteMessage(messageId, user.id),
    );
  }) satisfies RequestHandler,

  getConversationInfo: (async (request, response) => {
    const user = requireCurrentUser(response);
    const conversationId = readPositiveInteger(request.params, "conversationId");

    response.status(200).json(
      await MessageService.getConversationInfo(conversationId, user.id),
    );
  }) satisfies RequestHandler,

  markAsRead: (async (request, response) => {
    const user = requireCurrentUser(response);
    const conversationId = readPositiveInteger(request.params, "conversationId");
    response.status(200).json(
      await MessageService.markAsRead(conversationId, user.id),
    );
  }) satisfies RequestHandler,
};
