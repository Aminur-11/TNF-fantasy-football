import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePlayerPoints, deriveResult, type Position } from "@/lib/scoring";
import { toScoringRules, getActiveScoringRuleVersion } from "@/lib/scoring-rules";

/**
 * Recalculates derived fantasy points for a single match, then cascades to
 * recalculate every fantasy team's gameweek total that could be affected.
 *
 * Deterministic & idempotent: always replaces derived rows from the current
 * source data (PlayerMatchStat + the gameweek's frozen scoring-rule version),
 * never increments existing totals. Safe to call repeatedly.
 */
export async function recalculateMatch(matchId: string): Promise<void> {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      playerStats: true,
      gameweek: { include: { scoringRuleVersion: { include: { positionRules: true } } } },
    },
  });

  let version = match.gameweek.scoringRuleVersion;
  if (!version) {
    version = await getActiveScoringRuleVersion();
    await prisma.gameweek.update({
      where: { id: match.gameweekId },
      data: { scoringRuleVersionId: version.id },
    });
  }
  const rules = toScoringRules(version);

  const resultA = deriveResult(match.scoreA, match.scoreB);
  const resultB = deriveResult(match.scoreB, match.scoreA);
  const concededA = match.scoreB;
  const concededB = match.scoreA;

  await prisma.$transaction(
    match.playerStats.map((stat) => {
      const isSideA = stat.teamSide === "A";
      const scoring = calculatePlayerPoints(
        {
          position: stat.positionAtTime as Position,
          appearance: stat.appearance,
          goals: stat.goals,
          assists: stat.assists,
          motm: stat.motm,
          goalsConceded: isSideA ? concededA : concededB,
          result: isSideA ? resultA : resultB,
          isCaptain: false, // base points are captain-agnostic; multiplier applied per-manager below
          bonusPoints: stat.bonusPoints,
        },
        rules,
      );

      return prisma.fantasyPlayerPoints.upsert({
        where: { playerMatchStatId: stat.id },
        create: {
          playerMatchStatId: stat.id,
          gameweekId: match.gameweekId,
          playerId: stat.playerId,
          basePoints: scoring.basePoints,
          breakdown: scoring.breakdown as unknown as Prisma.InputJsonValue,
        },
        update: {
          basePoints: scoring.basePoints,
          breakdown: scoring.breakdown as unknown as Prisma.InputJsonValue,
        },
      });
    }),
  );

  await recalculateGameweekTeamPoints(match.gameweekId);
}

/**
 * Recomputes every fantasy team's total points for a gameweek from the
 * team's frozen squad snapshot + each player's current FantasyPlayerPoints.
 * Replace-not-increment: always overwrites the stored total.
 */
export async function recalculateGameweekTeamPoints(gameweekId: string): Promise<void> {
  const gameweek = await prisma.gameweek.findUniqueOrThrow({
    where: { id: gameweekId },
    include: { scoringRuleVersion: true },
  });
  const captainMultiplier = gameweek.scoringRuleVersion?.captainMultiplier ?? 2;

  const squads = await prisma.fantasyGameweekSquad.findMany({
    where: { gameweekId },
    include: { players: true },
  });

  const pointsByPlayer = await prisma.fantasyPlayerPoints.groupBy({
    by: ["playerId"],
    where: { gameweekId },
    _sum: { basePoints: true },
  });
  const baseByPlayer = new Map(
    pointsByPlayer.map((p) => [p.playerId, p._sum.basePoints ?? 0]),
  );

  await prisma.$transaction(
    squads.map((squad) => {
      let total = 0;
      const breakdown = squad.players.map((sp) => {
        const base = baseByPlayer.get(sp.playerId) ?? 0;
        const multiplier = sp.isCaptain ? captainMultiplier : 1;
        const finalPoints = base * multiplier;
        total += finalPoints;
        return {
          playerId: sp.playerId,
          isCaptain: sp.isCaptain,
          basePoints: base,
          multiplier,
          finalPoints,
        };
      });

      return prisma.fantasyTeamGameweekPoints.upsert({
        where: {
          fantasyTeamId_gameweekId: {
            fantasyTeamId: squad.fantasyTeamId,
            gameweekId,
          },
        },
        create: {
          fantasyTeamId: squad.fantasyTeamId,
          gameweekId,
          points: total,
          breakdown,
        },
        update: { points: total, breakdown },
      });
    }),
  );
}

/** Recalculates every match in a gameweek. Used when completing a gameweek as a safety net. */
export async function recalculateGameweek(gameweekId: string): Promise<void> {
  const matches = await prisma.match.findMany({
    where: { gameweekId },
    select: { id: true },
  });
  for (const m of matches) {
    await recalculateMatch(m.id);
  }
  // Ensure teams with no matches this gameweek still get a (zero) total.
  await recalculateGameweekTeamPoints(gameweekId);
}
