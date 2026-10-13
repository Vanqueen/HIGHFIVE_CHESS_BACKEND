import { createHash, randomBytes } from "node:crypto";
import {
  createChallengeInvitationLink,
  disableChallengeInvitationLink,
  expireInvitationLink,
  findChallengeInvitationLinks,
  findInvitationLink,
  findInvitationLinkByTokenHash,
  redeemChallengeInvitationLink,
} from "../repository/invitation-link.repository";
import { findChallenge } from "../repository/challenge.repository";
import { findUser } from "../repository/user.repository";
import { signGuestGameToken } from "../utils/guestGameToken";
import { expireChallengeAndNotify } from "./challengeExpirationService";
import { NotificationService } from "./notificationService";
import { publishGameBroadcast } from "../events/game.broadcast";
import { GAME_ACTIONS } from "../events/game.events";
import HttpError, { rethrowServiceError } from "./errorService";

const MAX_LINK_LIFETIME_MINUTES = 30;
const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function withoutTokenHash<T extends { tokenHash: string }>(link: T) {
  const { tokenHash: _tokenHash, ...publicLink } = link;
  return publicLink;
}

function epochMilliseconds(value: Date) {
  const temporalValue = Reflect.get(value, "epochMilliseconds");
  return typeof temporalValue === "number" ? temporalValue : value.getTime();
}

export class InvitationLinkService {
  static async createChallengeLink(
    creatorId: number,
    challengeId: number,
    expiresInMinutes = MAX_LINK_LIFETIME_MINUTES,
  ) {
    try {
      if (
        !Number.isSafeInteger(expiresInMinutes) ||
        expiresInMinutes < 1 ||
        expiresInMinutes > MAX_LINK_LIFETIME_MINUTES
      ) {
        throw new HttpError("La durée du lien doit être comprise entre 1 et 30 minutes.", 422, false);
      }
      const challenge = await findChallenge(challengeId);
      if (!challenge) throw new HttpError("Défi introuvable.", 404, false);
      if (challenge.creatorId !== creatorId) {
        throw new HttpError("Seul le créateur peut générer un lien.", 403, false);
      }
      if (challenge.status !== "PENDING") {
        throw new HttpError("Le défi n'est plus en attente.", 409, false);
      }
      if (epochMilliseconds(challenge.expiresAt) <= Date.now()) {
        await expireChallengeAndNotify(challengeId);
        throw new HttpError("Le défi a expiré.", 410, false);
      }

      const token = randomBytes(32).toString("base64url");
      const requestedExpiry = new Date(Date.now() + expiresInMinutes * 60_000);
      const expiresAt = requestedExpiry.getTime() < epochMilliseconds(challenge.expiresAt)
        ? requestedExpiry
        : challenge.expiresAt;
      // The raw token is returned once; only its digest is persisted.
      const link = await createChallengeInvitationLink(
        creatorId,
        challengeId,
        hashInvitationToken(token),
        expiresAt,
      );
      if (!link) throw new HttpError("Le défi ne peut plus recevoir de liens.", 409, false);
      return { ...withoutTokenHash(link), token };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la création du lien d'invitation :");
    }
  }

  static async getChallengeLinks(creatorId: number, challengeId: number) {
    try {
      const challenge = await findChallenge(challengeId);
      if (!challenge) throw new HttpError("Défi introuvable.", 404, false);
      if (challenge.creatorId !== creatorId) {
        throw new HttpError("Seul le créateur peut consulter ces liens.", 403, false);
      }
      if (
        challenge.status === "PENDING" &&
        epochMilliseconds(challenge.expiresAt) <= Date.now()
      ) {
        await expireChallengeAndNotify(challengeId);
      }

      const links = await findChallengeInvitationLinks(challengeId, creatorId);
      const now = new Date();
      return Promise.all(links.map(async (link) => {
        if (
          link.status === "ACTIVE" &&
          link.expiresAt &&
          epochMilliseconds(link.expiresAt) <= now.getTime()
        ) {
          await expireInvitationLink(link.id);
          return { ...withoutTokenHash(link), status: "EXPIRED" as const };
        }
        return withoutTokenHash(link);
      }));
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la consultation des liens d'invitation :");
    }
  }

  static async revokeChallengeLink(creatorId: number, challengeId: number, linkId: number) {
    try {
      const link = await findInvitationLink(linkId);
      if (!link || link.challengeId !== challengeId) {
        throw new HttpError("Lien d'invitation introuvable.", 404, false);
      }
      if (link.creatorId !== creatorId) {
        throw new HttpError("Seul le créateur peut révoquer ce lien.", 403, false);
      }
      const disabled = await disableChallengeInvitationLink(creatorId, challengeId, linkId);
      if (!disabled) throw new HttpError("Ce lien n'est plus actif.", 409, false);
      return { id: linkId, status: "DISABLED" as const };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la révocation du lien d'invitation :");
    }
  }

  static async redeemChallengeLink(token: string, userId: number | null) {
    try {
      if (!RAW_TOKEN_PATTERN.test(token)) {
        throw new HttpError("Lien d'invitation invalide.", 404, false);
      }
      const tokenHash = hashInvitationToken(token);
      const link = await findInvitationLinkByTokenHash(tokenHash);
      if (!link || link.type !== "FRIEND_CHALLENGE" || link.challengeId === null) {
        throw new HttpError("Lien d'invitation invalide.", 404, false);
      }
      if (link.status !== "ACTIVE" || link.currentUses >= (link.maxUses ?? 0)) {
        throw new HttpError("Ce lien a déjà été utilisé ou désactivé.", 410, false);
      }
      if (link.expiresAt && epochMilliseconds(link.expiresAt) <= Date.now()) {
        await expireInvitationLink(link.id);
        throw new HttpError("Ce lien d'invitation a expiré.", 410, false);
      }

      const [challenge, user] = await Promise.all([
        findChallenge(link.challengeId),
        userId === null ? Promise.resolve(null) : findUser(userId),
      ]);
      if (!challenge) throw new HttpError("Le défi associé n'existe plus.", 410, false);
      if (
        challenge.status !== "PENDING" ||
        epochMilliseconds(challenge.expiresAt) <= Date.now()
      ) {
        if (challenge.status === "PENDING") {
          await expireChallengeAndNotify(challenge.id);
        }
        throw new HttpError("Le défi associé n'est plus disponible.", 410, false);
      }
      if (userId !== null && challenge.creatorId === userId) {
        throw new HttpError("Vous ne pouvez pas accepter votre propre défi.", 409, false);
      }
      if (userId === null && challenge.invitedUserId !== null) {
        throw new HttpError("Ce défi est réservé à un joueur connecté.", 403, false);
      }
      if (userId !== null && challenge.invitedUserId !== null && challenge.invitedUserId !== userId) {
        throw new HttpError("Ce défi est réservé à un autre joueur.", 403, false);
      }
      if (userId !== null && (!user || user.accountStatus !== "ACTIVE" || user.deletedAt !== null)) {
        throw new HttpError("Votre compte ne peut pas accepter ce défi.", 403, false);
      }

      const accepted = await redeemChallengeInvitationLink(
        link.id,
        tokenHash,
        challenge.id,
        challenge.creatorId,
        challenge.invitedUserId,
        userId,
        link.expiresAt,
        challenge.expiresAt,
      );
      if (!accepted) throw new HttpError("Ce lien ou ce défi n'est plus disponible.", 409, false);
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
        ...(userId === null
          ? {
              guestSessionToken: signGuestGameToken({
                kind: "guest-session",
                gameId: accepted.game.id,
                participantId: accepted.participant.id,
              }, 12 * 60 * 60),
            }
          : {}),
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'utilisation du lien d'invitation :");
    }
  }
}
