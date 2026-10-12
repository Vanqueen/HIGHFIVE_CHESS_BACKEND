import { createHash, randomBytes } from "node:crypto";
import {
  advanceTournamentRound,
  cancelTournament,
  createTournament,
  createTournamentInvitationLink,
  expireTournamentInvitationLink,
  findGamePlayerRows,
  findTournament,
  findTournamentGameRows,
  findTournamentInvitationLink,
  findTournamentInvitationLinks,
  findTournamentParticipantByUser,
  findTournamentParticipants,
  findTournamentRounds,
  findTournaments,
  registerTournamentUser,
  revokeTournamentInvitationLink,
  setTournamentStatus,
  startTournamentWithRound,
  withdrawTournamentUser,
  type TournamentPairing,
  type TournamentRoundSetup,
  type TournamentStandingUpdate,
} from "../repository/tournament.repository";
import { findUser } from "../repository/user.repository";
import HttpError, { rethrowServiceError } from "./errorService";
import {
  calculateRoundRobinRoundCount,
  calculateSwissRoundCount,
  createRoundRobinPairings,
  createSwissPairings,
  getPairKey,
  type PairingPlayer,
} from "./tournamentPairing";

const MAX_TOURNAMENT_SIZE = 500;
const MAX_CLOCK_SECONDS = 2 * 60 * 60;
const MAX_INCREMENT_SECONDS = 180;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STANDARD_INVITE_LIFETIME_MINUTES = 60 * 24 * 7;

type TournamentRecord = NonNullable<Awaited<ReturnType<typeof findTournament>>>;
type ParticipantRecord = Awaited<ReturnType<typeof findTournamentParticipants>>[number];

interface Standing extends TournamentStandingUpdate {
  userId: number | null;
  participantType: string;
  displayName: string;
  status: string;
  seed: number | null;
  joinedAt: Date;
  byes: number;
  opponents: Set<number>;
  whiteGames: number;
  blackGames: number;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function activeTournamentParticipants(participants: ParticipantRecord[]) {
  return participants.filter((participant) =>
    participant.status === "REGISTERED" || participant.status === "ACTIVE"
  );
}

function validateClock(initialTimeSeconds: number, incrementSeconds: number) {
  if (
    !Number.isSafeInteger(initialTimeSeconds) ||
    initialTimeSeconds < 0 ||
    initialTimeSeconds > MAX_CLOCK_SECONDS ||
    !Number.isSafeInteger(incrementSeconds) ||
    incrementSeconds < 0 ||
    incrementSeconds > MAX_INCREMENT_SECONDS ||
    (initialTimeSeconds === 0 && incrementSeconds !== 0)
  ) {
    throw new HttpError("Contrôle du temps invalide.", 422, false);
  }
}

function ensureOwner(tournament: TournamentRecord, userId: number) {
  if (tournament.organizerId !== userId) {
    throw new HttpError("Action réservée à l'organisateur du tournoi.", 403, false);
  }
}

function mapRegistrationResult(result: Awaited<ReturnType<typeof registerTournamentUser>>) {
  switch (result.kind) {
    case "registered":
      return result.participant;
    case "missing":
      throw new HttpError("Tournoi introuvable.", 404, false);
    case "closed":
      throw new HttpError("Les inscriptions ne sont pas ouvertes.", 409, false);
    case "duplicate":
      throw new HttpError("Vous êtes déjà inscrit à ce tournoi.", 409, false);
    case "full":
      throw new HttpError("Le tournoi a atteint sa capacité maximale.", 409, false);
    case "link-exhausted":
      throw new HttpError("Ce lien d'invitation a atteint sa limite d'utilisations.", 410, false);
    case "invalid-link":
      throw new HttpError("Lien d'invitation de tournoi invalide ou expiré.", 410, false);
  }
}

function buildStandings(participants: ParticipantRecord[]): Standing[] {
  return participants.map((participant) => ({
    participantId: participant.id,
    userId: participant.userId,
    participantType: participant.participantType,
    displayName: participant.displayName,
    status: participant.status,
    seed: participant.seed,
    joinedAt: participant.joinedAt,
    score: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    byes: 0,
    opponents: new Set<number>(),
    whiteGames: 0,
    blackGames: 0,
  }));
}

async function readStandings(tournamentId: number) {
  const [participants, rounds] = await Promise.all([
    findTournamentParticipants(tournamentId),
    findTournamentRounds(tournamentId),
  ]);
  const standings = buildStandings(participants);
  const byParticipantId = new Map(standings.map((standing) => [
    standing.participantId,
    standing,
  ]));

  for (const round of rounds) {
    const games = await findTournamentGameRows(round.id);
    if (!games.length || games.some((game) => game.status !== "FINISHED")) continue;

    const pairedIds = new Set<number>();
    for (const game of games) {
      const seats = await findGamePlayerRows(game.id);
      const white = seats.find((seat) => seat.color === "WHITE")?.tournamentParticipantId;
      const black = seats.find((seat) => seat.color === "BLACK")?.tournamentParticipantId;
      if (white === null || white === undefined || black === null || black === undefined) {
        throw new HttpError("Appariement de tournoi incomplet.", 500, false);
      }
      const whiteStanding = byParticipantId.get(white);
      const blackStanding = byParticipantId.get(black);
      if (!whiteStanding || !blackStanding) {
        throw new HttpError("Participant de partie absent du classement du tournoi.", 500, false);
      }
      pairedIds.add(white);
      pairedIds.add(black);
      whiteStanding.opponents.add(black);
      blackStanding.opponents.add(white);
      whiteStanding.whiteGames += 1;
      blackStanding.blackGames += 1;

      if (game.result === "WHITE_WIN") {
        whiteStanding.score += 1;
        whiteStanding.wins += 1;
        blackStanding.losses += 1;
      } else if (game.result === "BLACK_WIN") {
        blackStanding.score += 1;
        blackStanding.wins += 1;
        whiteStanding.losses += 1;
      } else if (game.result === "DRAW") {
        whiteStanding.score += 0.5;
        blackStanding.score += 0.5;
        whiteStanding.draws += 1;
        blackStanding.draws += 1;
      } else {
        throw new HttpError("Résultat de partie terminé absent.", 500, false);
      }
    }

    // In an odd field, the active player without a pairing receives one bye point.
    const byeCandidates = standings.filter((standing) =>
      (standing.status === "ACTIVE" || standing.status === "FINISHED") &&
      standing.joinedAt <= round.createdAt &&
      !pairedIds.has(standing.participantId)
    );
    if (byeCandidates.length === 1) {
      byeCandidates[0].score += 1;
      byeCandidates[0].byes += 1;
    }
  }

  return standings.sort((left, right) =>
    right.score - left.score ||
    right.wins - left.wins ||
    (left.seed ?? Number.MAX_SAFE_INTEGER) - (right.seed ?? Number.MAX_SAFE_INTEGER) ||
    left.joinedAt.getTime() - right.joinedAt.getTime()
  );
}

function getPairingPlayers(standings: Standing[]): PairingPlayer[] {
  return standings
    .filter((standing) =>
      standing.status === "ACTIVE" &&
      standing.userId !== null &&
      standing.participantType === "USER"
    )
    .map((standing) => ({
      id: standing.participantId,
      userId: standing.userId!,
      displayName: standing.displayName,
      score: standing.score,
      wins: standing.wins,
      seed: standing.seed,
      joinedAt: standing.joinedAt,
      whiteGames: standing.whiteGames,
      blackGames: standing.blackGames,
      hadBye: standing.byes > 0,
    }));
}

async function buildPairingSetup(
  tournament: TournamentRecord,
  roundNumber: number,
  standings: Standing[],
  rounds: Awaited<ReturnType<typeof findTournamentRounds>>,
  timeControl?: { initialTimeSeconds: number; incrementSeconds: number },
): Promise<TournamentRoundSetup> {
  const players = getPairingPlayers(standings);
  const priorOpponents = new Set<string>();
  for (const round of rounds) {
    const games = await findTournamentGameRows(round.id);
    for (const game of games) {
      const seats = await findGamePlayerRows(game.id);
      const userIds = seats
        .map((seat) => seat.tournamentParticipantId)
        .filter((id): id is number => id !== null);
      if (userIds.length === 2) priorOpponents.add(getPairKey(userIds[0], userIds[1]));
    }
  }

  const plan = tournament.format === "ROUND_ROBIN"
    ? createRoundRobinPairings(players, roundNumber)
    : createSwissPairings(players, priorOpponents);
  let selectedClock = timeControl;
  if (!selectedClock && rounds.length > 0) {
    const previousGames = await findTournamentGameRows(rounds.at(-1)!.id);
    const previousGame = previousGames[0];
    if (!previousGame) {
      throw new HttpError("Contrôle du temps de la ronde précédente introuvable.", 500, false);
    }
    selectedClock = {
      initialTimeSeconds: previousGame.initialTimeSeconds,
      incrementSeconds: previousGame.incrementSeconds,
    };
  }
  if (!selectedClock) {
    throw new HttpError("Le contrôle du temps doit être défini pour la première ronde.", 422, false);
  }
  validateClock(selectedClock.initialTimeSeconds, selectedClock.incrementSeconds);

  const pairings: TournamentPairing[] = plan.pairings.map((pairing) => ({
    white: {
      id: pairing.white.id,
      userId: pairing.white.userId,
      displayName: pairing.white.displayName,
    },
    black: {
      id: pairing.black.id,
      userId: pairing.black.userId,
      displayName: pairing.black.displayName,
    },
  }));
  return {
    ...selectedClock,
    pairings,
    ...(plan.byeParticipantId === undefined ? {} : { byeParticipantId: plan.byeParticipantId }),
  };
}

export class TournamentService {
  static async createTournament(
    organizerId: number,
    input: {
      name: string;
      description?: string | null;
      format: "SWISS" | "ROUND_ROBIN";
      maxParticipants: number;
      registrationStartsAt: Date;
      registrationEndsAt: Date;
      startsAt: Date;
      isRated?: boolean;
      ratingCategory?: "BLITZ" | "RAPID" | "CLASSICAL" | null;
    },
  ) {
    try {
      const organizer = await findUser(organizerId);
      if (
        !organizer ||
        organizer.deletedAt !== null ||
        organizer.accountStatus !== "ACTIVE" ||
        (organizer.role !== "ORGANIZER" && organizer.role !== "ADMIN")
      ) {
        throw new HttpError("Un compte organisateur actif est requis.", 403, false);
      }
      const now = new Date();
      if (!input.name.trim() || input.name.trim().length > 120) {
        throw new HttpError("Le nom du tournoi doit contenir entre 1 et 120 caractères.", 422, false);
      }
      if (
        !Number.isSafeInteger(input.maxParticipants) ||
        input.maxParticipants < 2 ||
        input.maxParticipants > MAX_TOURNAMENT_SIZE
      ) {
        throw new HttpError("La capacité doit être comprise entre 2 et 500 participants.", 422, false);
      }
      if (
        input.registrationStartsAt <= now ||
        input.registrationEndsAt <= input.registrationStartsAt ||
        input.startsAt < input.registrationEndsAt
      ) {
        throw new HttpError("Les dates d'inscription et de début sont incohérentes.", 422, false);
      }
      if (input.format !== "SWISS" && input.format !== "ROUND_ROBIN") {
        throw new HttpError("Format de tournoi invalide.", 422, false);
      }
      const isRated = input.isRated ?? false;
      const ratingCategory = input.ratingCategory ?? null;
      if (isRated && ratingCategory === null) {
        throw new HttpError("La catégorie est obligatoire pour un tournoi classé.", 422, false);
      }
      if (!isRated && ratingCategory !== null) {
        throw new HttpError("Une catégorie de rating ne peut être définie que pour un tournoi classé.", 422, false);
      }
      return await createTournament({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        organizerId,
        format: input.format,
        status: "DRAFT",
        maxParticipants: input.maxParticipants,
        registrationStartsAt: input.registrationStartsAt,
        registrationEndsAt: input.registrationEndsAt,
        startsAt: input.startsAt,
        endsAt: null,
        isRated,
        ratingCategory,
      });
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la création du tournoi :");
    }
  }

  static async listTournaments(limit = 100) {
    try {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new HttpError("Limite de tournois invalide.", 422, false);
      }
      return await findTournaments(limit);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la liste des tournois :");
    }
  }

  static async getTournament(tournamentId: number) {
    try {
      const tournament = await findTournament(tournamentId);
      if (!tournament) throw new HttpError("Tournoi introuvable.", 404, false);
      const [participants, rounds] = await Promise.all([
        findTournamentParticipants(tournamentId),
        findTournamentRounds(tournamentId),
      ]);
      return {
        tournament,
        participants: participants.map((participant) => ({
          id: participant.id,
          userId: participant.userId,
          participantType: participant.participantType,
          displayName: participant.displayName,
          status: participant.status,
          seed: participant.seed,
          score: participant.score,
          wins: participant.wins,
          draws: participant.draws,
          losses: participant.losses,
          joinedAt: participant.joinedAt,
          leftAt: participant.leftAt,
          eliminatedAt: participant.eliminatedAt,
        })),
        rounds,
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération du tournoi :");
    }
  }

  static async getRound(tournamentId: number, roundNumber: number) {
    try {
      const tournament = await findTournament(tournamentId);
      if (!tournament) throw new HttpError("Tournoi introuvable.", 404, false);
      const rounds = await findTournamentRounds(tournamentId);
      const round = rounds.find((candidate) => candidate.roundNumber === roundNumber);
      if (!round) throw new HttpError("Ronde introuvable.", 404, false);
      const games = await findTournamentGameRows(round.id);
      return {
        round,
        games: await Promise.all(games.map(async (game) => ({
          game,
          participants: await findGamePlayerRows(game.id),
        }))),
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération de la ronde :");
    }
  }

  static async openRegistration(tournamentId: number, organizerId: number) {
    try {
      const tournament = await findTournament(tournamentId);
      if (!tournament) throw new HttpError("Tournoi introuvable.", 404, false);
      ensureOwner(tournament, organizerId);
      if (tournament.status !== "DRAFT") {
        throw new HttpError("Seul un tournoi en brouillon peut ouvrir les inscriptions.", 409, false);
      }
      if (tournament.startsAt <= new Date()) {
        throw new HttpError("Le tournoi aurait déjà dû commencer.", 409, false);
      }
      const updated = await setTournamentStatus(
        tournamentId,
        organizerId,
        "DRAFT",
        "REGISTRATION_OPEN",
      );
      if (!updated) throw new HttpError("Le tournoi a changé. Rechargez son état.", 409, false);
      return updated;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'ouverture des inscriptions :");
    }
  }

  static async closeRegistration(tournamentId: number, organizerId: number) {
    try {
      const tournament = await findTournament(tournamentId);
      if (!tournament) throw new HttpError("Tournoi introuvable.", 404, false);
      ensureOwner(tournament, organizerId);
      if (tournament.status !== "REGISTRATION_OPEN") {
        throw new HttpError("Les inscriptions ne sont pas ouvertes.", 409, false);
      }
      const updated = await setTournamentStatus(
        tournamentId,
        organizerId,
        "REGISTRATION_OPEN",
        "REGISTRATION_CLOSED",
      );
      if (!updated) throw new HttpError("Le tournoi a changé. Rechargez son état.", 409, false);
      return updated;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la fermeture des inscriptions :");
    }
  }

  static async registerUser(tournamentId: number, userId: number) {
    try {
      const user = await findUser(userId);
      if (!user || user.accountStatus !== "ACTIVE" || user.deletedAt !== null) {
        throw new HttpError("Un compte actif est requis pour participer à un tournoi.", 403, false);
      }
      const result = await registerTournamentUser(tournamentId, userId, user.username);
      return mapRegistrationResult(result);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'inscription au tournoi :");
    }
  }

  static async withdrawUser(tournamentId: number, userId: number) {
    try {
      const result = await withdrawTournamentUser(tournamentId, userId);
      if (result.kind === "withdrawn") return result.participant;
      if (result.kind === "missing") throw new HttpError("Tournoi introuvable.", 404, false);
      if (result.kind === "closed") {
        throw new HttpError("Le retrait est fermé après la fin des inscriptions.", 409, false);
      }
      throw new HttpError("Vous n'êtes pas inscrit à ce tournoi.", 404, false);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du retrait du tournoi :");
    }
  }

  static async createInvitationLink(
    tournamentId: number,
    organizerId: number,
    maxUses: number | null = null,
    expiresAt?: Date,
  ) {
    try {
      const tournament = await findTournament(tournamentId);
      if (!tournament) throw new HttpError("Tournoi introuvable.", 404, false);
      ensureOwner(tournament, organizerId);
      if (tournament.status === "CANCELLED" || tournament.status === "FINISHED") {
        throw new HttpError("Le tournoi ne peut plus recevoir de liens.", 409, false);
      }
      if (
        maxUses !== null &&
        (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > tournament.maxParticipants)
      ) {
        throw new HttpError("La limite d'utilisations du lien est invalide.", 422, false);
      }
      const expiry = expiresAt ?? new Date(
        Date.now() + STANDARD_INVITE_LIFETIME_MINUTES * 60_000,
      );
      if (expiry <= new Date() || expiry > tournament.registrationEndsAt) {
        throw new HttpError("L'expiration doit être future et ne pas dépasser la clôture des inscriptions.", 422, false);
      }
      const token = randomBytes(32).toString("base64url");
      const link = await createTournamentInvitationLink({
        tokenHash: hashToken(token),
        tournamentId,
        creatorId: organizerId,
        maxUses,
        expiresAt: expiry,
      });
      if (!link) throw new HttpError("Impossible de créer ce lien de tournoi.", 409, false);
      const { tokenHash: _tokenHash, ...publicLink } = link;
      return { ...publicLink, token };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la création du lien de tournoi :");
    }
  }

  static async listInvitationLinks(tournamentId: number, organizerId: number) {
    try {
      const tournament = await findTournament(tournamentId);
      if (!tournament) throw new HttpError("Tournoi introuvable.", 404, false);
      ensureOwner(tournament, organizerId);
      const links = await findTournamentInvitationLinks(tournamentId);
      return Promise.all(links.map(async (link) => {
        if (link.status === "ACTIVE" && link.expiresAt && link.expiresAt <= new Date()) {
          await expireTournamentInvitationLink(link.id);
          const { tokenHash: _tokenHash, ...publicLink } = link;
          return { ...publicLink, status: "EXPIRED" as const };
        }
        const { tokenHash: _tokenHash, ...publicLink } = link;
        return publicLink;
      }));
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la consultation des liens de tournoi :");
    }
  }

  static async revokeInvitationLink(
    tournamentId: number,
    organizerId: number,
    linkId: number,
  ) {
    try {
      const revoked = await revokeTournamentInvitationLink(
        tournamentId,
        organizerId,
        linkId,
      );
      if (!revoked) throw new HttpError("Lien actif introuvable.", 404, false);
      return { id: linkId, status: "DISABLED" as const };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la révocation du lien de tournoi :");
    }
  }

  static async redeemInvitationLink(token: string, userId: number) {
    try {
      if (!TOKEN_PATTERN.test(token)) {
        throw new HttpError("Lien d'invitation invalide.", 404, false);
      }
      const user = await findUser(userId);
      if (!user || user.accountStatus !== "ACTIVE" || user.deletedAt !== null) {
        throw new HttpError("Un compte actif est requis pour participer à un tournoi.", 403, false);
      }
      const link = await findTournamentInvitationLink(hashToken(token));
      if (!link || link.tournamentId === null) {
        throw new HttpError("Lien d'invitation invalide.", 404, false);
      }
      if (link.status !== "ACTIVE" || (link.expiresAt && link.expiresAt <= new Date())) {
        throw new HttpError("Lien d'invitation expiré ou désactivé.", 410, false);
      }
      return mapRegistrationResult(
        await registerTournamentUser(
          link.tournamentId,
          userId,
          user.username,
          link.id,
        ),
      );
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'utilisation du lien de tournoi :");
    }
  }

  static async startTournament(
    tournamentId: number,
    organizerId: number,
    initialTimeSeconds: number,
    incrementSeconds: number,
  ) {
    try {
      validateClock(initialTimeSeconds, incrementSeconds);
      const tournament = await findTournament(tournamentId);
      if (!tournament) throw new HttpError("Tournoi introuvable.", 404, false);
      ensureOwner(tournament, organizerId);
      if (tournament.status !== "REGISTRATION_CLOSED") {
        throw new HttpError("Fermez les inscriptions avant le démarrage.", 409, false);
      }
      if (tournament.startsAt > new Date()) {
        throw new HttpError("Le tournoi ne peut pas commencer avant sa date prévue.", 409, false);
      }
      const participants = await findTournamentParticipants(tournamentId);
      const active = activeTournamentParticipants(participants);
      if (active.length < 2) {
        throw new HttpError("Au moins deux comptes inscrits sont nécessaires.", 409, false);
      }
      if (active.some((participant) =>
        participant.participantType !== "USER" || participant.userId === null
      )) {
        throw new HttpError("Les tournois sont réservés aux utilisateurs authentifiés.", 409, false);
      }
      const standings = buildStandings(active).map((standing) => ({
        ...standing,
        status: "ACTIVE",
      }));
      const setup = await buildPairingSetup(
        tournament,
        1,
        standings,
        [],
        { initialTimeSeconds, incrementSeconds },
      );
      const started = await startTournamentWithRound(tournamentId, organizerId, setup);
      if (!started) throw new HttpError("Le tournoi a changé ou n'a plus assez de participants.", 409, false);
      return started;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du démarrage du tournoi :");
    }
  }

  static async advanceRound(tournamentId: number, organizerId: number) {
    try {
      const tournament = await findTournament(tournamentId);
      if (!tournament) throw new HttpError("Tournoi introuvable.", 404, false);
      ensureOwner(tournament, organizerId);
      if (tournament.status !== "IN_PROGRESS") {
        throw new HttpError("Le tournoi n'est pas en cours.", 409, false);
      }

      const rounds = await findTournamentRounds(tournamentId);
      const currentRound = rounds.at(-1);
      if (!currentRound || currentRound.status !== "IN_PROGRESS") {
        throw new HttpError("Aucune ronde active n'a été trouvée.", 409, false);
      }
      const games = await findTournamentGameRows(currentRound.id);
      if (!games.length || games.some((game) => game.status !== "FINISHED")) {
        throw new HttpError("Toutes les parties de la ronde doivent être terminées.", 409, false);
      }

      const standings = await readStandings(tournamentId);
      const activePlayers = getPairingPlayers(standings);
      const totalRounds = tournament.format === "ROUND_ROBIN"
        ? calculateRoundRobinRoundCount(activePlayers.length)
        : calculateSwissRoundCount(activePlayers.length);
      const finishTournament = currentRound.roundNumber >= totalRounds;
      const setup = finishTournament
        ? await buildPairingSetup(tournament, currentRound.roundNumber, standings, rounds)
        : await buildPairingSetup(
            tournament,
            currentRound.roundNumber + 1,
            standings,
            rounds,
          );
      const result = await advanceTournamentRound(
        tournamentId,
        organizerId,
        currentRound.roundNumber,
        setup,
        finishTournament,
        standings.map(({ participantId, score, wins, draws, losses }) => ({
          participantId,
          score,
          wins,
          draws,
          losses,
        })),
      );
      if (!result) throw new HttpError("La ronde a changé ou contient des parties non terminées.", 409, false);
      return result;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du passage à la ronde suivante :");
    }
  }

  static async getStandings(tournamentId: number) {
    try {
      const tournament = await findTournament(tournamentId);
      if (!tournament) throw new HttpError("Tournoi introuvable.", 404, false);
      const standings = await readStandings(tournamentId);
      return standings.map((standing, index) => ({
        rank: index + 1,
        participantId: standing.participantId,
        userId: standing.userId,
        displayName: standing.displayName,
        participantType: standing.participantType,
        status: standing.status,
        score: standing.score,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        byes: standing.byes,
      }));
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du calcul du classement :");
    }
  }

  static async cancel(tournamentId: number, organizerId: number) {
    try {
      const cancelled = await cancelTournament(tournamentId, organizerId);
      if (!cancelled) {
        const tournament = await findTournament(tournamentId);
        if (!tournament) throw new HttpError("Tournoi introuvable.", 404, false);
        if (tournament.organizerId !== organizerId) {
          throw new HttpError("Action réservée à l'organisateur du tournoi.", 403, false);
        }
        throw new HttpError("Un tournoi commencé ou terminé ne peut plus être annulé.", 409, false);
      }
      return { id: tournamentId, status: "CANCELLED" as const };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'annulation du tournoi :");
    }
  }
}
