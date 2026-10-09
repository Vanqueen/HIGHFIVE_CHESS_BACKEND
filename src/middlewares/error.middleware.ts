import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const candidate = typeof error === "object" && error !== null
    ? error as { statusCode?: unknown; status?: unknown; message?: unknown; success?: unknown }
    : {};
  const errorStatus = typeof candidate.statusCode === "number"
    ? candidate.statusCode
    : typeof candidate.status === "number"
      ? candidate.status
      : 500;
  const status = errorStatus >= 400 && errorStatus < 600 ? errorStatus : 500;
  const message = status < 500 && typeof candidate.message === "string"
    ? candidate.message
    : "Erreur serveur. Veuillez réessayer plus tard.";

  if (status >= 500) {
    console.error("Erreur serveur non traitée :", error);
  }

  response.status(status).json({
    success: false,
    message,
  });
};
