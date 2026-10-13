import {
  acceptPendingChallenge,
  cancelPendingChallenge,
  createChallengeWithGame,
  declinePendingChallenge,
  expireDuePendingChallenges,
  findChallenge,
  findChallengesByCreator,
  findChallengesByInvitee,
} from "../repository/challenge.repository";
import { findGamesByChallenge } from "../repository/game.repository";
import { findUser } from "../repository/user.repository";
import { NotificationService } from "./notificationService";
import {
  expireChallengeAndNotify,
  publishChallengeExpiration,
} from "./challengeExpirationService";
import { publishGameBroadcast } from "../events/game.broadcast";
import { GAME_ACTIONS } from "../events/game.events";
import HttpError, { rethrowServiceError } from "./errorService";

const CHALLENGE_LIFETIME_MS = 30 * 60 * 1000;
const MAX_INITIAL_TIME_SECONDS = 2 * 60 * 60;
const MAX_INCREMENT_SECONDS = 180;

function assertTimeControl(initialTimeSeconds: number, incrementSeconds: number) {
  // Zero base time is the current contract for an untimed game and cannot have an increment.
  if (
    !Number.isSafeInteger(initialTimeSeconds) ||
    initialTimeSeconds < 0 ||
    initialTimeSeconds > MAX_INITIAL_TIME_SECONDS ||
    !Number.isSafeInteger(incrementSeconds) ||
    incrementSeconds < 0 ||
    incrementSeconds > MAX_INCREMENT_SECONDS ||
    (initialTimeSeconds === 0 && incrementSeconds !== 0)
  ) {
    throw new HttpError("Contrôle du temps invalide.", 422, false);
  }
}

function epochMilliseconds(value: Date) {
  const temporalValue = Reflect.get(value, "epochMilliseconds");
  return typeof temporalValue === "number" ? temporalValue : value.getTime();
}

export class ChallengeService {
  /** Creates a challenge and the creator's waiting game with the selected clock. */
  static async createChallenge(
    creatorId: number,
    invitedUserId: number | null,
    initialTimeSeconds: number,
    incrementSeconds = 0,
  ) {
    try {
      assertTimeControl(initialTimeSeconds, incrementSeconds);
      if (
        invitedUserId !== null &&
        (!Number.isSafeInteger(invitedUserId) || invitedUserId <= 0)
      ) {
        throw new HttpError("Identifiant du joueur invité invalide.", 422, false);
      }
      if (invitedUserId !== null && creatorId === invitedUserId) {
        throw new HttpError("Vous ne pouvez pas vous défier vous-même.", 422, false);
      }

      const creator = await findUser(creatorId);
      if (!creator || creator.accountStatus !== "ACTIVE" || creator.deletedAt !== null) {
        throw new HttpError("Votre compte ne peut pas lancer de défi.", 403, false);
      }
      if (invitedUserId !== null) {
        const invitee = await findUser(invitedUserId);
        if (!invitee || invitee.accountStatus !== "ACTIVE" || invitee.deletedAt !== null) {
          throw new HttpError("Joueur invité introuvable ou indisponible.", 404, false);
        }
      }

      const created = await createChallengeWithGame({
        creatorId,
        invitedUserId,
        status: "PENDING",
        expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME_MS),
      }, initialTimeSeconds, incrementSeconds, creator.username);
      NotificationService.publishMany(created.notifications);
      return {
        challenge: created.challenge,
        game: created.game,
        participant: created.participant,
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la création du défi :");
    }
  }

  /** Returns only challenges involving this user and applies elapsed expirations. */
  static async getChallengesForUser(userId: number, limit = 50) {
    try {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new HttpError("Limite de défis invalide.", 422, false);
      }
      const [created, received] = await Promise.all([
        findChallengesByCreator(userId, limit),
        findChallengesByInvitee(userId, limit),
      ]);
      const challenges = [...created, ...received]
        .sort((left, right) =>
          epochMilliseconds(right.createdAt) - epochMilliseconds(left.createdAt)
        )
        .slice(0, limit);

      const now = new Date();
      return Promise.all(challenges.map(async (challenge) => {
        if (
          challenge.status === "PENDING" &&
          epochMilliseconds(challenge.expiresAt) <= now.getTime()
        ) {
          await this.expireChallenge(challenge.id);
          return { ...challenge, status: "EXPIRED" as const };
        }
        return challenge;
      }));
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des défis :");
    }
  }

  /** Accepts only for the invitee; the repository rechecks eligibility atomically. */
  static async acceptChallenge(challengeId: number, userId: number) {
    try {
      const challenge = await findChallenge(challengeId);
      if (!challenge) throw new HttpError("Défi introuvable.", 404, false);
      if (challenge.invitedUserId !== userId) {
        throw new HttpError("Ce défi ne vous est pas destiné.", 403, false);
      }
      if (challenge.status !== "PENDING") {
        throw new HttpError("Ce défi n'est plus en attente.", 409, false);
      }
      if (epochMilliseconds(challenge.expiresAt) <= Date.now()) {
        await this.expireChallenge(challengeId);
        throw new HttpError("Ce défi a expiré.", 410, false);
      }

      const accepted = await acceptPendingChallenge(challengeId, userId);
      if (!accepted) throw new HttpError("Le défi a déjà été traité ou a expiré.", 409, false);
      NotificationService.publishMany(accepted.notifications);
      publishGameBroadcast({
        type: "updated",
        gameId: accepted.game.id,
        action: GAME_ACTIONS.CHALLENGE_ACCEPTED,
        result: { challenge: accepted.challenge, game: accepted.game },
      });
      return {
        challenge: accepted.challenge,
        game: accepted.game,
        participant: accepted.participant,
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'acceptation du défi :");
    }
  }

  static async declineChallenge(challengeId: number, userId: number) {
    try {
      const challenge = await findChallenge(challengeId);
      if (!challenge) throw new HttpError("Défi introuvable.", 404, false);
      if (challenge.invitedUserId !== userId) {
        throw new HttpError("Ce défi ne vous est pas destiné.", 403, false);
      }
      if (
        challenge.status === "PENDING" &&
        epochMilliseconds(challenge.expiresAt) <= Date.now()
      ) {
        await this.expireChallenge(challengeId);
        throw new HttpError("Ce défi a expiré.", 410, false);
      }
      const transition = await declinePendingChallenge(challengeId, userId);
      if (!transition) {
        throw new HttpError("Ce défi n'est plus en attente.", 409, false);
      }
      NotificationService.publishMany(transition.notifications);
      const games = await findGamesByChallenge(challengeId, 1);
      const game = games[0];
      if (!game) throw new HttpError("Partie associée au défi introuvable.", 500, false);
      publishGameBroadcast({
        type: "updated",
        gameId: game.id,
        action: GAME_ACTIONS.CHALLENGE_DECLINED,
        result: { challenge: transition.challenge, game },
      });
      return transition.challenge;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du refus du défi :");
    }
  }

  static async cancelChallenge(challengeId: number, userId: number) {
    try {
      const challenge = await findChallenge(challengeId);
      if (!challenge) throw new HttpError("Défi introuvable.", 404, false);
      if (challenge.creatorId !== userId) {
        throw new HttpError("Seul le créateur peut annuler ce défi.", 403, false);
      }
      if (
        challenge.status === "PENDING" &&
        epochMilliseconds(challenge.expiresAt) <= Date.now()
      ) {
        await this.expireChallenge(challengeId);
        throw new HttpError("Ce défi a expiré.", 410, false);
      }
      const transition = await cancelPendingChallenge(challengeId, userId);
      if (!transition) {
        throw new HttpError("Ce défi n'est plus en attente.", 409, false);
      }
      NotificationService.publishMany(transition.notifications);
      const games = await findGamesByChallenge(challengeId, 1);
      const game = games[0];
      if (!game) throw new HttpError("Partie associée au défi introuvable.", 500, false);
      publishGameBroadcast({
        type: "updated",
        gameId: game.id,
        action: GAME_ACTIONS.CHALLENGE_CANCELLED,
        result: { challenge: transition.challenge, game },
      });
      return transition.challenge;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'annulation du défi :");
    }
  }

  static async expireChallenge(challengeId: number) {
    return expireChallengeAndNotify(challengeId);
  }

  static async expireDueChallenges(limit = 100) {
    const transitions = await expireDuePendingChallenges(limit);
    for (const transition of transitions) {
      publishChallengeExpiration(transition);
    }
    return transitions.length;
  }
}
