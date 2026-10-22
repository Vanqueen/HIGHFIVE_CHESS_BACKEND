import {
  acceptFriendshipRequest,
  createOrUpdateFriendshipRequest,
  findFriendshipsForUser,
  removeFriendshipBetweenUsers,
  rejectFriendshipRequest,
} from "../repository/friendship.repository";
import {
  areUsersBlocked,
  createBlockAndRemoveFriendships,
  deleteBlock,
  findBlocksByUser,
} from "../repository/blocked-user.repository";
import { findUser } from "../repository/user.repository";
import { NotificationService } from "./notificationService";
import HttpError, { rethrowServiceError } from "./errorService";

function assertDistinctUsers(actorId: number, targetId: number) {
  if (!Number.isSafeInteger(targetId) || targetId <= 0 || targetId === actorId) {
    throw new HttpError("Identifiant d’utilisateur invalide.", 422, false);
  }
}

async function requireAvailableUser(userId: number) {
  const user = await findUser(userId);
  if (!user || user.accountStatus !== "ACTIVE" || user.deletedAt !== null) {
    throw new HttpError("Utilisateur introuvable ou indisponible.", 404, false);
  }
  return user;
}

export class SocialService {
  static async getFriendships(userId: number) {
    try {
      const friendships = await findFriendshipsForUser(userId);
      const otherUserIds = [...new Set(friendships.map((friendship) =>
        friendship.requesterId === userId
          ? friendship.addresseeId
          : friendship.requesterId
      ))];
      const otherUsers = await Promise.all(otherUserIds.map((id) => findUser(id)));
      const usernamesById = new Map(
        otherUserIds.map((id, index) => [id, otherUsers[index]?.username ?? null]),
      );

      return friendships.map((friendship) => ({
        ...friendship,
        otherUsername: usernamesById.get(
          friendship.requesterId === userId
            ? friendship.addresseeId
            : friendship.requesterId,
        ) ?? null,
      }));
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des amitiés :");
    }
  }

  static async requestFriendship(requesterId: number, addresseeId: number) {
    try {
      assertDistinctUsers(requesterId, addresseeId);
      const [requester] = await Promise.all([
        requireAvailableUser(requesterId),
        requireAvailableUser(addresseeId),
      ]);
      if (await areUsersBlocked(requesterId, addresseeId)) {
        throw new HttpError("Cette interaction n’est pas autorisée.", 403, false);
      }

      const result = await createOrUpdateFriendshipRequest(
        requesterId,
        addresseeId,
        requester.username,
      );
      if (result.kind === "raced" || !result.friendship) {
        throw new HttpError("La demande a changé. Réessayez.", 409, false);
      }
      if (result.kind === "existing") {
        throw new HttpError("Une demande existe déjà ou vous êtes déjà amis.", 409, false);
      }
      NotificationService.publishMany(result.notifications);
      return result.friendship;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l’envoi de la demande d’amitié :");
    }
  }

  static async acceptFriendship(userId: number, friendshipId: number) {
    try {
      const friendships = await findFriendshipsForUser(userId);
      const friendship = friendships.find((item) => item.id === friendshipId);
      if (!friendship) throw new HttpError("Demande d’amitié introuvable.", 404, false);
      if (friendship.addresseeId !== userId || friendship.status !== "PENDING") {
        throw new HttpError("Cette demande ne peut pas être acceptée.", 403, false);
      }
      if (await areUsersBlocked(friendship.requesterId, friendship.addresseeId)) {
        throw new HttpError("Cette interaction n’est pas autorisée.", 403, false);
      }
      const result = await acceptFriendshipRequest(friendshipId, userId);
      if (!result) throw new HttpError("La demande a déjà été traitée.", 409, false);
      NotificationService.publishMany(result.notifications);
      return result.friendship;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l’acceptation de la demande d’amitié :");
    }
  }

  static async rejectFriendship(userId: number, friendshipId: number) {
    try {
      const result = await rejectFriendshipRequest(friendshipId, userId);
      if (!result) {
        throw new HttpError("Demande d’amitié introuvable ou déjà traitée.", 404, false);
      }
      return result;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du refus de la demande d’amitié :");
    }
  }

  static async removeFriendship(userId: number, friendshipId: number) {
    try {
      const rows = await findFriendshipsForUser(userId);
      const friendship = rows.find((item) => item.id === friendshipId);
      if (!friendship) throw new HttpError("Amitié introuvable.", 404, false);
      if (friendship.status !== "ACCEPTED") {
        throw new HttpError("Seule une amitié acceptée peut être supprimée ici.", 409, false);
      }
      const otherUserId = friendship.requesterId === userId
        ? friendship.addresseeId
        : friendship.requesterId;
      const removed = await removeFriendshipBetweenUsers(
        friendshipId,
        friendship.requesterId,
        friendship.addresseeId,
      );
      if (!removed) throw new HttpError("L’amitié a déjà été supprimée.", 409, false);
      return { friendshipId, userId, otherUserId };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la suppression de l’amitié :");
    }
  }

  static async getBlockedUsers(userId: number) {
    try {
      return await findBlocksByUser(userId);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des blocages :");
    }
  }

  static async blockUser(blockerId: number, blockedUserId: number) {
    try {
      assertDistinctUsers(blockerId, blockedUserId);
      await requireAvailableUser(blockedUserId);
      if (await areUsersBlocked(blockerId, blockedUserId)) {
        throw new HttpError("Cet utilisateur est déjà bloqué.", 409, false);
      }
      return await createBlockAndRemoveFriendships(blockerId, blockedUserId);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du blocage de l’utilisateur :");
    }
  }

  static async unblockUser(blockerId: number, blockedUserId: number) {
    try {
      assertDistinctUsers(blockerId, blockedUserId);
      const deleted = await deleteBlock(blockerId, blockedUserId);
      if (!deleted) throw new HttpError("Blocage introuvable.", 404, false);
      return { blockerId, blockedUserId, unblocked: true };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du déblocage de l’utilisateur :");
    }
  }

  static async assertUsersCanInteract(firstUserId: number, secondUserId: number) {
    if (await areUsersBlocked(firstUserId, secondUserId)) {
      throw new HttpError("Cette interaction n’est pas autorisée.", 403, false);
    }
  }
}
