// Central scoring engine.
//
// This is the ONLY place fantasy-point arithmetic happens. Every call site
// (admin stat entry, recalculation jobs, tests) must go through
// `calculatePlayerPoints`. Do not reimplement any of this math elsewhere.
//
// The engine is a pure function: same inputs -> same output, always. That
// determinism is what makes recalculation idempotent (see recalc.ts).

export type Position = "DEF" | "MID" | "FWD";
export type MatchResult = "WIN" | "DRAW" | "LOSS";

export interface PositionRule {
  position: Position;
  appearancePoints: number;
  goalPoints: number;
  assistPoints: number;
  motmPoints: number;
  // Bonus points awarded when the team concedes fewer than concededBonusThreshold goals.
  concededBonusPoints: number;
  concededBonusThreshold: number;
}

export interface ScoringRules {
  positionRules: Record<Position, PositionRule>;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  captainMultiplier: number;
}

export interface PlayerScoringInput {
  position: Position;
  appearance: boolean;
  goals: number;
  assists: number;
  motm: boolean;
  goalsConceded: number;
  result: MatchResult;
  isCaptain: boolean;
  // Discretionary points an admin awards (or deducts) by hand — can be
  // negative. Applied as-is, independent of position.
  bonusPoints: number;
}

export interface ScoringBreakdown {
  appearance: number;
  goals: number;
  assists: number;
  motm: number;
  goalsConceded: number;
  result: number;
  bonus: number;
}

export interface ScoringResult {
  basePoints: number;
  multiplier: number;
  finalPoints: number;
  breakdown: ScoringBreakdown;
}

const ZERO_BREAKDOWN: ScoringBreakdown = {
  appearance: 0,
  goals: 0,
  assists: 0,
  motm: 0,
  goalsConceded: 0,
  result: 0,
  bonus: 0,
};

function sumBreakdown(b: ScoringBreakdown): number {
  return (
    b.appearance + b.goals + b.assists + b.motm + b.goalsConceded + b.result + b.bonus
  );
}

/**
 * Calculates a single player's fantasy points for a single match appearance.
 *
 * A non-appearance always yields 0 points, regardless of any other stat
 * present in the input — goals/assists/MOTM/result/conceded are only ever
 * scored for a player who actually appeared.
 */
export function calculatePlayerPoints(
  input: PlayerScoringInput,
  rules: ScoringRules,
): ScoringResult {
  if (!input.appearance) {
    return {
      basePoints: 0,
      multiplier: input.isCaptain ? rules.captainMultiplier : 1,
      finalPoints: 0,
      breakdown: { ...ZERO_BREAKDOWN },
    };
  }

  const rule = rules.positionRules[input.position];
  if (!rule) {
    throw new Error(`No scoring rule configured for position ${input.position}`);
  }
  if (input.goals < 0 || input.assists < 0 || input.goalsConceded < 0) {
    throw new Error("Goals, assists and goals conceded must be non-negative");
  }
  if (input.bonusPoints < -20 || input.bonusPoints > 20) {
    throw new Error("Bonus points must be between -20 and 20");
  }

  const resultPoints =
    input.result === "WIN"
      ? rules.winPoints
      : input.result === "DRAW"
        ? rules.drawPoints
        : rules.lossPoints;

  const breakdown: ScoringBreakdown = {
    appearance: rule.appearancePoints,
    goals: input.goals * rule.goalPoints,
    assists: input.assists * rule.assistPoints,
    motm: input.motm ? rule.motmPoints : 0,
    goalsConceded:
      input.goalsConceded < rule.concededBonusThreshold ? rule.concededBonusPoints : 0,
    result: resultPoints,
    bonus: input.bonusPoints,
  };

  const basePoints = sumBreakdown(breakdown);
  const multiplier = input.isCaptain ? rules.captainMultiplier : 1;

  return {
    basePoints,
    multiplier,
    finalPoints: basePoints * multiplier,
    breakdown,
  };
}

/** Derives WIN/DRAW/LOSS for a given side from the final score. */
export function deriveResult(scoreFor: number, scoreAgainst: number): MatchResult {
  if (scoreFor > scoreAgainst) return "WIN";
  if (scoreFor < scoreAgainst) return "LOSS";
  return "DRAW";
}

export const VALID_FORMATIONS: ReadonlyArray<{
  DEF: number;
  MID: number;
  FWD: number;
}> = [
  { DEF: 3, MID: 3, FWD: 1 },
  { DEF: 3, MID: 2, FWD: 2 },
  { DEF: 2, MID: 3, FWD: 2 },
];

export interface FormationValidationResult {
  valid: boolean;
  error?: string;
  counts: { DEF: number; MID: number; FWD: number };
}

/**
 * Validates that a set of exactly 7 players forms one of the three legal
 * formations. Does not check duplicates or budget — callers combine this
 * with `findDuplicatePlayerIds` and a budget check.
 */
export function validateFormation(
  positions: Position[],
): FormationValidationResult {
  const counts = { DEF: 0, MID: 0, FWD: 0 };
  for (const p of positions) counts[p]++;

  if (positions.length !== 7) {
    return {
      valid: false,
      error: `You need exactly 7 players (currently ${positions.length}).`,
      counts,
    };
  }

  const isValid = VALID_FORMATIONS.some(
    (f) => f.DEF === counts.DEF && f.MID === counts.MID && f.FWD === counts.FWD,
  );

  if (!isValid) {
    const messages: string[] = [];
    if (counts.DEF < 2 || counts.DEF > 3) messages.push("Select 2–3 defenders");
    if (counts.MID < 2 || counts.MID > 3) messages.push("Select 2–3 midfielders");
    if (counts.FWD < 1 || counts.FWD > 2) messages.push("Select 1–2 forwards");
    return {
      valid: false,
      error:
        messages.length > 0
          ? messages.join(". ")
          : "Invalid formation. Valid formations: 3-3-1, 3-2-2, 2-3-2 (DEF-MID-FWD).",
      counts,
    };
  }

  return { valid: true, counts };
}

export function findDuplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}
