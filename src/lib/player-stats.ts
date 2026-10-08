import { deriveResult } from "@/lib/scoring";

export interface PlayerStatTotals {
  appearances: number;
  goals: number;
  assists: number;
  wins: number;
  goalsConceded: number;
  motm: number;
}

export interface PlayerMatchStatRow {
  playerId: string;
  teamSide: "A" | "B";
  appearance: boolean;
  goals: number;
  assists: number;
  motm: boolean;
  match: { scoreA: number; scoreB: number };
}

const ZERO_TOTALS: PlayerStatTotals = {
  appearances: 0,
  goals: 0,
  assists: 0,
  wins: 0,
  goalsConceded: 0,
  motm: 0,
};

/**
 * Aggregates raw per-match stat rows into career totals per player.
 * A non-appearance contributes nothing — consistent with how the scoring
 * engine treats it (see `calculatePlayerPoints`).
 */
export function aggregatePlayerStats(
  rows: PlayerMatchStatRow[],
): Map<string, PlayerStatTotals> {
  const totals = new Map<string, PlayerStatTotals>();

  for (const row of rows) {
    if (!row.appearance) continue;

    const isSideA = row.teamSide === "A";
    const scoreFor = isSideA ? row.match.scoreA : row.match.scoreB;
    const scoreAgainst = isSideA ? row.match.scoreB : row.match.scoreA;
    const result = deriveResult(scoreFor, scoreAgainst);

    const existing = totals.get(row.playerId) ?? { ...ZERO_TOTALS };
    existing.appearances += 1;
    existing.goals += row.goals;
    existing.assists += row.assists;
    existing.wins += result === "WIN" ? 1 : 0;
    existing.goalsConceded += scoreAgainst;
    existing.motm += row.motm ? 1 : 0;
    totals.set(row.playerId, existing);
  }

  return totals;
}
