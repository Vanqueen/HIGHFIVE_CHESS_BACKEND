import { describe, expect, it } from "vitest";
import {
  calculateRoundRobinRoundCount,
  calculateSwissRoundCount,
  createRoundRobinPairings,
  createSwissPairings,
  getPairKey,
  sortSwissStandings,
  type PairingPlayer,
} from "./tournamentPairing";

function players(count: number): PairingPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    userId: index + 101,
    displayName: `Player ${index + 1}`,
    score: 0,
    wins: 0,
    seed: index + 1,
    joinedAt: new Date(2026, 0, index + 1),
    whiteGames: 0,
    blackGames: 0,
    hadBye: false,
  }));
}

describe("tournament pairing algorithms", () => {
  it("calculates Swiss round count automatically and never returns zero", () => {
    expect(calculateSwissRoundCount(2)).toBe(1);
    expect(calculateSwissRoundCount(5)).toBe(3);
    expect(calculateSwissRoundCount(0)).toBe(1);
  });

  it("creates a round-robin schedule where every pair meets exactly once", () => {
    const entrants = players(6);
    const rounds = calculateRoundRobinRoundCount(entrants.length);
    const meetings = new Map<string, number>();

    for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
      const plan = createRoundRobinPairings(entrants, roundNumber);
      expect(plan.pairings).toHaveLength(entrants.length / 2);
      for (const pairing of plan.pairings) {
        const key = getPairKey(pairing.white.id, pairing.black.id);
        meetings.set(key, (meetings.get(key) ?? 0) + 1);
      }
    }

    expect(rounds).toBe(5);
    expect(meetings.size).toBe(15);
    expect([...meetings.values()].every((count) => count === 1)).toBe(true);
  });

  it("gives each player one bye across an odd round-robin field", () => {
    const entrants = players(5);
    const byes = [];

    for (let roundNumber = 1; roundNumber <= calculateRoundRobinRoundCount(5); roundNumber += 1) {
      const plan = createRoundRobinPairings(entrants, roundNumber);
      expect(plan.pairings).toHaveLength(2);
      if (plan.byeParticipantId !== undefined) byes.push(plan.byeParticipantId);
    }

    expect(byes).toHaveLength(5);
    expect(new Set(byes).size).toBe(5);
  });

  it("avoids Swiss rematches and assigns a bye to someone who has not had one", () => {
    const entrants = players(5);
    const previousOpponents = new Set([
      getPairKey(1, 2),
      getPairKey(3, 4),
    ]);
    entrants[4].hadBye = true;
    entrants[4].score = 0;
    const plan = createSwissPairings(entrants, previousOpponents);

    expect(plan.pairings).toHaveLength(2);
    expect(plan.byeParticipantId).not.toBe(5);
    for (const pairing of plan.pairings) {
      expect(previousOpponents.has(getPairKey(pairing.white.id, pairing.black.id))).toBe(false);
    }
  });

  it("breaks Swiss ties by score, Buchholz and median Buchholz", () => {
    const standings = [
      {
        participantId: 1,
        score: 2,
        wins: 2,
        seed: 1,
        joinedAt: new Date(2026, 0, 1),
        opponents: new Set([2, 3]),
      },
      {
        participantId: 2,
        score: 2,
        wins: 2,
        seed: 2,
        joinedAt: new Date(2026, 0, 2),
        opponents: new Set([1, 4]),
      },
      {
        participantId: 3,
        score: 2,
        wins: 1,
        seed: 3,
        joinedAt: new Date(2026, 0, 3),
        opponents: new Set([1, 5]),
      },
      {
        participantId: 4,
        score: 1.5,
        wins: 1,
        seed: 4,
        joinedAt: new Date(2026, 0, 4),
        opponents: new Set([2, 5]),
      },
      {
        participantId: 5,
        score: 1.5,
        wins: 1,
        seed: 5,
        joinedAt: new Date(2026, 0, 5),
        opponents: new Set([3, 4]),
      },
    ] as const;

    const ranked = sortSwissStandings(standings.map((standing) => ({
      ...standing,
      score: standing.score,
    })));

    expect(ranked.map((standing) => standing.participantId)).toEqual([1, 2, 3, 4, 5]);
    expect(ranked[0].score).toBe(2);
    expect(ranked[0].wins).toBe(2);
  });
});
