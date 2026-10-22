export interface PairingPlayer {
  id: number;
  userId: number;
  displayName: string;
  score: number;
  wins: number;
  seed: number | null;
  joinedAt: Date | { epochMilliseconds: number };
  whiteGames: number;
  blackGames: number;
  hadBye: boolean;
}

function timestamp(value: Date | { epochMilliseconds: number }) {
  return value instanceof Date ? value.getTime() : value.epochMilliseconds;
}

export interface Pairing {
  white: PairingPlayer;
  black: PairingPlayer;
}

export interface PairingPlan {
  pairings: Pairing[];
  byeParticipantId?: number;
}

function rankingOrder(left: PairingPlayer, right: PairingPlayer) {
  return right.score - left.score ||
    right.wins - left.wins ||
    (left.seed ?? Number.MAX_SAFE_INTEGER) - (right.seed ?? Number.MAX_SAFE_INTEGER) ||
    timestamp(left.joinedAt) - timestamp(right.joinedAt) ||
    left.id - right.id;
}

function pairKey(firstId: number, secondId: number) {
  return firstId < secondId ? `${firstId}:${secondId}` : `${secondId}:${firstId}`;
}

function colorCost(white: PairingPlayer, black: PairingPlayer) {
  return Math.abs(white.whiteGames + 1 - white.blackGames) +
    Math.abs(black.whiteGames - black.blackGames - 1);
}

export function calculateSwissRoundCount(playerCount: number) {
  return Math.max(1, Math.ceil(Math.log2(playerCount)));
}

export function calculateRoundRobinRoundCount(playerCount: number) {
  return playerCount % 2 === 0 ? playerCount - 1 : playerCount;
}

export function createRoundRobinPairings(
  input: PairingPlayer[],
  roundNumber: number,
): PairingPlan {
  const players = [...input].sort((left, right) =>
    (left.seed ?? left.id) - (right.seed ?? right.id) || left.id - right.id
  );
  if (players.length < 2) return { pairings: [] };

  const slots: Array<PairingPlayer | null> = [...players];
  if (slots.length % 2 !== 0) slots.push(null);
  const rounds = slots.length - 1;
  if (roundNumber < 1 || roundNumber > rounds) return { pairings: [] };

  const rotation = [...slots];
  for (let currentRound = 1; currentRound < roundNumber; currentRound += 1) {
    rotation.splice(1, 0, rotation.pop() ?? null);
  }

  const pairings: Pairing[] = [];
  let byeParticipantId: number | undefined;
  for (let index = 0; index < rotation.length / 2; index += 1) {
    const first = rotation[index];
    const second = rotation[rotation.length - 1 - index];
    if (first === null || second === null) {
      const bye = first ?? second;
      if (bye) byeParticipantId = bye.id;
      continue;
    }

    const firstGetsWhite = (roundNumber + index) % 2 === 1;
    pairings.push(firstGetsWhite
      ? { white: first, black: second }
      : { white: second, black: first });
  }
  return {
    pairings,
    ...(byeParticipantId === undefined ? {} : { byeParticipantId }),
  };
}

export function createSwissPairings(
  input: PairingPlayer[],
  previousOpponents: ReadonlySet<string>,
): PairingPlan {
  const ordered = [...input].sort(rankingOrder);
  if (ordered.length < 2) return { pairings: [] };

  let byeParticipantId: number | undefined;
  if (ordered.length % 2 !== 0) {
    const bye = [...ordered].reverse().find((player) => !player.hadBye) ??
      ordered.at(-1);
    if (bye) {
      byeParticipantId = bye.id;
      ordered.splice(ordered.findIndex((player) => player.id === bye.id), 1);
    }
  }

  const pairings: Pairing[] = [];
  const remaining = [...ordered];
  while (remaining.length > 1) {
    const first = remaining.shift();
    if (!first) break;
    const rankingIndex = ordered.findIndex((player) => player.id === first.id);
    const preferred = remaining.filter((candidate) =>
      !previousOpponents.has(pairKey(first.id, candidate.id))
    );
    const candidates = preferred.length ? preferred : remaining;
    const halfSize = Math.floor(ordered.length / 2);
    const targetIndex = rankingIndex < halfSize
      ? Math.min(ordered.length - 1, rankingIndex + halfSize)
      : Math.max(0, rankingIndex - halfSize);
    candidates.sort((left, right) => {
      const leftDistance = Math.abs(ordered.indexOf(left) - targetIndex);
      const rightDistance = Math.abs(ordered.indexOf(right) - targetIndex);
      const leftColorCost = Math.min(colorCost(first, left), colorCost(left, first));
      const rightColorCost = Math.min(colorCost(first, right), colorCost(right, first));
      return leftDistance - rightDistance ||
        leftColorCost - rightColorCost ||
        rankingOrder(left, right);
    });
    const opponent = candidates[0];
    if (!opponent) break;
    const opponentIndex = remaining.findIndex((candidate) => candidate.id === opponent.id);
    remaining.splice(opponentIndex, 1);

    const firstWhiteCost = colorCost(first, opponent);
    const opponentWhiteCost = colorCost(opponent, first);
    pairings.push(firstWhiteCost <= opponentWhiteCost
      ? { white: first, black: opponent }
      : { white: opponent, black: first });
  }

  return {
    pairings,
    ...(byeParticipantId === undefined ? {} : { byeParticipantId }),
  };
}

export interface SwissStandingLike {
  participantId: number;
  score: number;
  wins: number;
  seed: number | null;
  joinedAt: Date | { epochMilliseconds: number };
  opponents: Set<number>;
}

export function sortSwissStandings<T extends SwissStandingLike>(standings: T[]) {
  const scoreByParticipantId = new Map<number, number>(
    standings.map((standing) => [standing.participantId, standing.score]),
  );

  const ranking = standings.map((standing) => {
    const opponentScores = [...standing.opponents]
      .map((participantId) => scoreByParticipantId.get(participantId) ?? 0)
      .sort((left, right) => left - right);
    const medianBuchholz = opponentScores.length === 0
      ? 0
      : opponentScores.length % 2 === 0
        ? (opponentScores[opponentScores.length / 2 - 1] + opponentScores[opponentScores.length / 2]) / 2
        : opponentScores[Math.floor(opponentScores.length / 2)];

    return {
      standing,
      buchholz: opponentScores.reduce((sum, score) => sum + score, 0),
      medianBuchholz,
    };
  });

  return ranking
    .sort((left, right) =>
      right.standing.score - left.standing.score ||
      right.buchholz - left.buchholz ||
      right.medianBuchholz - left.medianBuchholz ||
      right.standing.wins - left.standing.wins ||
      (left.standing.seed ?? Number.MAX_SAFE_INTEGER) - (right.standing.seed ?? Number.MAX_SAFE_INTEGER) ||
      timestamp(left.standing.joinedAt) - timestamp(right.standing.joinedAt) ||
      left.standing.participantId - right.standing.participantId,
    )
    .map(({ standing }) => standing);
}

export function getPairKey(firstId: number, secondId: number) {
  return pairKey(firstId, secondId);
}
