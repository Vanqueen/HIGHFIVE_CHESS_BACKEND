import type { Request, Response } from "express";
import HttpError from "../service/errorService";

interface AuthenticatedUser {
  id: number;
  role: string;
}

interface AuthenticatedLocals {
  user?: AuthenticatedUser;
}

export function requireCurrentUser(response: Response): AuthenticatedUser {
  const user = (response.locals as unknown as AuthenticatedLocals).user;
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new HttpError("Authentification requise.", 401, false);
  }
  return user;
}

export function requireAdmin(response: Response): AuthenticatedUser {
  const user = requireCurrentUser(response);
  if (user.role !== "ADMIN") {
    throw new HttpError("Action réservée aux administrateurs.", 403, false);
  }
  return user;
}

export function readParamId(request: Request, name = "id"): number {
  const value = request.params[name];
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError("Identifiant invalide.", 422, false);
  }

  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new HttpError("Identifiant invalide.", 422, false);
  }
  return id;
}

export function readBody(request: Request): Record<string, unknown> {
  const body: unknown = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError("Corps de requête invalide.", 422, false);
  }
  return body as Record<string, unknown>;
}

export function readString(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== "string") {
    throw new HttpError(`Le champ ${name} est requis.`, 422, false);
  }
  return value;
}

export function serializeBigInts(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeBigInts(nested)]),
    );
  }
  return value;
}

export function readPositiveInteger(body: Record<string, unknown>, name: string): number {
  const value = body[name];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(`Le champ ${name} doit être un entier positif.`, 422, false);
  }
  return value;
}
