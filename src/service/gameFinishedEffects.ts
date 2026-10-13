import { db } from "../prisma/db.ts";
import type { NotificationBroadcast } from "../events/notification.broadcast";
import { NotificationService } from "./notificationService";
import { calculateTournamentRatingChanges } from "./tournamentRating";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FinishedGameRecord = {
  id: number;
  type: string;
  status: "FINISHED" | "CANCELLED";
  isRated: boolean;
  ratingCategory?: "BLITZ" | "RAPID" | "CLASSICAL" | null;
  result?: "WHITE_WIN" | "BLACK_WIN" | "DRAW" | null;
  tournamentRoundId?: number | null;
};

export type FinishedGameParticipant = {
  id: number;
  gameId: number;
  color: "WHITE" | "BLACK";
  participantType: string;
  userId: number | null;
  displayName?: string | null;
};

async function applyNonTournamentRating(
  tx: Transaction,
  game: FinishedGameRecord,
  participants: FinishedGameParticipant[],
) {
  if (
    game.type === "TOURNAMENT" ||
    !game.isRated ||
    !game.result ||
    !game.ratingCategory ||
    game.tournamentRoundId !== null
  ) {
    return;
  }

  const white = participants.find((participant) =>
    participant.color === "WHITE" &&
    participant.participantType === "USER" &&
    participant.userId !== null,
  );
  const black = participants.find((participant) =>
    participant.color === "BLACK" &&
    participant.participantType === "USER" &&
    participant.userId !== null,
  );

  if (!white?.userId || !black?.userId || white.userId === black.userId) {
    return;
  }

  const existingHistory = await tx.orm.public.RatingHistory.where({ gameId: game.id }).all();
  if (existingHistory.length > 0) {
    return;
  }

  const ratings = await Promise.all([
    tx.orm.public.Rating.where({ userId: white.userId, category: game.ratingCategory }).first(),
    tx.orm.public.Rating.where({ userId: black.userId, category: game.ratingCategory }).first(),
  ]);

  const whiteRating = ratings[0] ?? await tx.orm.public.Rating.create({
    userId: white.userId,
    category: game.ratingCategory,
    rating: 1500,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    provisional: true,
  });
  const blackRating = ratings[1] ?? await tx.orm.public.Rating.create({
    userId: black.userId,
    category: game.ratingCategory,
    rating: 1500,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    provisional: true,
  });

  const changes = calculateTournamentRatingChanges(
    whiteRating.rating,
    blackRating.rating,
    game.result,
  );
  const actualWhite = game.result === "WHITE_WIN" ? 1 : game.result === "DRAW" ? 0.5 : 0;
  const actualBlack = 1 - actualWhite;
  const whiteAfter = whiteRating.rating + changes.white;
  const blackAfter = blackRating.rating + changes.black;

  await tx.orm.public.Rating.where({ id: whiteRating.id }).update({
    rating: whiteAfter,
    gamesPlayed: whiteRating.gamesPlayed + 1,
    wins: whiteRating.wins + (actualWhite === 1 ? 1 : 0),
    losses: whiteRating.losses + (actualWhite === 0 ? 1 : 0),
    draws: whiteRating.draws + (actualWhite === 0.5 ? 1 : 0),
    provisional: whiteRating.gamesPlayed + 1 < 20,
  });
  await tx.orm.public.Rating.where({ id: blackRating.id }).update({
    rating: blackAfter,
    gamesPlayed: blackRating.gamesPlayed + 1,
    wins: blackRating.wins + (actualBlack === 1 ? 1 : 0),
    losses: blackRating.losses + (actualBlack === 0 ? 1 : 0),
    draws: blackRating.draws + (actualBlack === 0.5 ? 1 : 0),
    provisional: blackRating.gamesPlayed + 1 < 20,
  });

  await tx.orm.public.RatingHistory.create({
    ratingId: whiteRating.id,
    gameId: game.id,
    ratingBefore: whiteRating.rating,
    ratingAfter: whiteAfter,
    ratingChange: changes.white,
    opponentRating: blackRating.rating,
    result: game.result,
  });
  await tx.orm.public.RatingHistory.create({
    ratingId: blackRating.id,
    gameId: game.id,
    ratingBefore: blackRating.rating,
    ratingAfter: blackAfter,
    ratingChange: changes.black,
    opponentRating: whiteRating.rating,
    result: game.result === "WHITE_WIN"
      ? "BLACK_WIN"
      : game.result === "BLACK_WIN"
        ? "WHITE_WIN"
        : "DRAW",
  });
}

async function emitGameFinishedNotifications(
  tx: Transaction,
  game: FinishedGameRecord,
  participants: FinishedGameParticipant[],
): Promise<NotificationBroadcast[]> {
  const notifications: NotificationBroadcast[] = [];
  const players = participants.filter((participant) =>
    participant.participantType === "USER" && participant.userId !== null,
  );
  if (players.length < 2) {
    return notifications;
  }

  for (const participant of players) {
    const userId = participant.userId;
    if (userId === null) continue;
    const existingNotifications = await tx.orm.public.Notification
      .where({ userId, type: "GAME_FINISHED" })
      .all();
    const alreadyNotified = existingNotifications.some((notification) => {
      const data = notification.data;
      return typeof data === "object" && data !== null && "gameId" in data &&
        data.gameId === game.id;
    });
    if (alreadyNotified) continue;

    const opponent = players.find((candidate) =>
      candidate.id !== participant.id && candidate.userId !== null && candidate.userId !== userId,
    );
    const opponentName = opponent?.displayName ?? "votre adversaire";
    const content = game.result === "DRAW"
      ? `La partie contre ${opponentName} est terminée sur un match nul.`
      : `La partie contre ${opponentName} est terminée : ${game.result === "WHITE_WIN" && participant.color === "WHITE" || game.result === "BLACK_WIN" && participant.color === "BLACK" ? "victoire" : "défaite"}.`;
    notifications.push(await NotificationService.createInTransaction(
      tx,
      userId,
      "GAME_FINISHED",
      "Partie terminée",
      content,
      {
        gameId: game.id,
        result: game.result ?? "DRAW",
        opponentName,
      },
    ));
  }
  return notifications;
}

async function recordFinishedGameStatistics(
  _tx: Transaction,
  _game: FinishedGameRecord,
  _participants: FinishedGameParticipant[],
) {
  // The current backend does not expose a dedicated stats aggregate model yet,
  // so this hook remains intentionally lightweight until the stats layer exists.
}

export async function finalizeGameFinishedEffects(
  tx: Transaction,
  game: FinishedGameRecord,
  participants: FinishedGameParticipant[] = [],
): Promise<NotificationBroadcast[]> {
  if (game.status !== "FINISHED" && game.status !== "CANCELLED") {
    return [];
  }

  const currentParticipants = participants.length > 0
    ? participants
    : await tx.orm.public.GameParticipant.where({ gameId: game.id }).all();

  await applyNonTournamentRating(tx, game, currentParticipants);
  const notifications = await emitGameFinishedNotifications(tx, game, currentParticipants);
  await recordFinishedGameStatistics(tx, game, currentParticipants);
  return notifications;
}

export function publishGameFinishedNotifications(notifications: NotificationBroadcast[]) {
  for (const notification of notifications) {
    NotificationService.publish(notification);
  }
}
