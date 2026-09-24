import { describe, it, expect } from "vitest";
import {
  calculatePlayerPoints,
  deriveResult,
  validateFormation,
  findDuplicateIds,
  type ScoringRules,
  type PlayerScoringInput,
} from "../scoring";

const INITIAL_RULES: ScoringRules = {
  positionRules: {
    DEF: {
      position: "DEF",
      appearancePoints: 2,
      goalPoints: 5,
      assistPoints: 3,
      motmPoints: 5,
      concededBonusPoints: 5,
      concededBonusThreshold: 5,
    },
    MID: {
      position: "MID",
      appearancePoints: 2,
      goalPoints: 4,
      assistPoints: 3,
      motmPoints: 5,
      concededBonusPoints: 5,
      concededBonusThreshold: 5,
    },
    FWD: {
      position: "FWD",
      appearancePoints: 2,
      goalPoints: 4,
      assistPoints: 3,
      motmPoints: 5,
      concededBonusPoints: 5,
      concededBonusThreshold: 5,
    },
  },
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  captainMultiplier: 2,
};

function baseInput(overrides: Partial<PlayerScoringInput>): PlayerScoringInput {
  return {
    position: "MID",
    appearance: true,
    goals: 0,
    assists: 0,
    motm: false,
    goalsConceded: 0,
    result: "LOSS",
    isCaptain: false,
    bonusPoints: 0,
    ...overrides,
  };
}

describe("calculatePlayerPoints — appearance", () => {
  it("awards appearance points for a player who played", () => {
    const r = calculatePlayerPoints(baseInput({}), INITIAL_RULES);
    expect(r.breakdown.appearance).toBe(2);
  });

  it("non-appearance always yields 0 points, ignoring other stats", () => {
    const r = calculatePlayerPoints(
      baseInput({
        appearance: false,
        goals: 5,
        assists: 5,
        motm: true,
        result: "WIN",
        isCaptain: true,
        bonusPoints: 10,
      }),
      INITIAL_RULES,
    );
    expect(r.basePoints).toBe(0);
    expect(r.finalPoints).toBe(0);
    expect(r.breakdown).toEqual({
      appearance: 0,
      goals: 0,
      assists: 0,
      motm: 0,
      goalsConceded: 0,
      result: 0,
      bonus: 0,
    });
  });
});

describe("calculatePlayerPoints — goals by position", () => {
  it("DEF goal = +5", () => {
    const r = calculatePlayerPoints(
      baseInput({ position: "DEF", goals: 1 }),
      INITIAL_RULES,
    );
    expect(r.breakdown.goals).toBe(5);
  });
  it("MID goal = +4", () => {
    const r = calculatePlayerPoints(
      baseInput({ position: "MID", goals: 1 }),
      INITIAL_RULES,
    );
    expect(r.breakdown.goals).toBe(4);
  });
  it("FWD goal = +4", () => {
    const r = calculatePlayerPoints(
      baseInput({ position: "FWD", goals: 1 }),
      INITIAL_RULES,
    );
    expect(r.breakdown.goals).toBe(4);
  });
  it("multiple goals scale linearly", () => {
    const r = calculatePlayerPoints(
      baseInput({ position: "DEF", goals: 3 }),
      INITIAL_RULES,
    );
    expect(r.breakdown.goals).toBe(15);
  });
});

describe("calculatePlayerPoints — assists & MOTM", () => {
  it("assist = +3 regardless of position", () => {
    for (const position of ["DEF", "MID", "FWD"] as const) {
      const r = calculatePlayerPoints(baseInput({ position, assists: 1 }), INITIAL_RULES);
      expect(r.breakdown.assists).toBe(3);
    }
  });
  it("MOTM = +5", () => {
    const r = calculatePlayerPoints(baseInput({ motm: true }), INITIAL_RULES);
    expect(r.breakdown.motm).toBe(5);
  });
  it("no MOTM = 0", () => {
    const r = calculatePlayerPoints(baseInput({ motm: false }), INITIAL_RULES);
    expect(r.breakdown.motm).toBe(0);
  });
});

describe("calculatePlayerPoints — result", () => {
  it("WIN = +3", () => {
    expect(calculatePlayerPoints(baseInput({ result: "WIN" }), INITIAL_RULES).breakdown.result).toBe(3);
  });
  it("DRAW = +1", () => {
    expect(calculatePlayerPoints(baseInput({ result: "DRAW" }), INITIAL_RULES).breakdown.result).toBe(1);
  });
  it("LOSS = 0", () => {
    expect(calculatePlayerPoints(baseInput({ result: "LOSS" }), INITIAL_RULES).breakdown.result).toBe(0);
  });
});

describe("calculatePlayerPoints — goals conceded bonus", () => {
  const cases: [number, number][] = [
    [0, 5],
    [4, 5],
    [5, 0],
    [6, 0],
    [10, 0],
  ];
  it.each(cases)("%i conceded -> %i points", (conceded, expected) => {
    const r = calculatePlayerPoints(baseInput({ goalsConceded: conceded }), INITIAL_RULES);
    expect(r.breakdown.goalsConceded).toBe(expected);
  });
});

describe("calculatePlayerPoints — captain multiplier", () => {
  it("doubles final points for captain", () => {
    const r = calculatePlayerPoints(
      baseInput({ position: "MID", goals: 2, assists: 1, motm: true, result: "WIN", isCaptain: true }),
      INITIAL_RULES,
    );
    // appearance 2 + goals 8 + assists 3 + motm 5 + conceded bonus 5 + win 3 = 26
    expect(r.basePoints).toBe(26);
    expect(r.multiplier).toBe(2);
    expect(r.finalPoints).toBe(52);
  });

  it("non-captain uses multiplier 1", () => {
    const r = calculatePlayerPoints(baseInput({ isCaptain: false }), INITIAL_RULES);
    expect(r.multiplier).toBe(1);
  });

  it("captain doubles the conceded bonus too", () => {
    const r = calculatePlayerPoints(
      baseInput({ goalsConceded: 0, isCaptain: true, result: "LOSS" }),
      INITIAL_RULES,
    );
    // appearance 2 + conceded bonus 5 = 7 base
    expect(r.basePoints).toBe(7);
    expect(r.finalPoints).toBe(14);
  });
});

describe("calculatePlayerPoints — combined example from spec", () => {
  it("matches the worked MID example", () => {
    const r = calculatePlayerPoints(
      baseInput({
        position: "MID",
        goals: 2,
        assists: 1,
        motm: true,
        result: "WIN",
        goalsConceded: 4,
        isCaptain: true,
      }),
      INITIAL_RULES,
    );
    expect(r.breakdown).toEqual({
      appearance: 2,
      goals: 8,
      assists: 3,
      motm: 5,
      goalsConceded: 5,
      result: 3,
      bonus: 0,
    });
    expect(r.basePoints).toBe(26);
    expect(r.finalPoints).toBe(52);
  });
});

describe("calculatePlayerPoints — discretionary bonus points", () => {
  it("adds a positive bonus to base points", () => {
    const r = calculatePlayerPoints(baseInput({ bonusPoints: 3 }), INITIAL_RULES);
    expect(r.breakdown.bonus).toBe(3);
    // appearance 2 + conceded bonus 5 (0 < 5 threshold) + bonus 3 = 10
    expect(r.basePoints).toBe(10);
  });

  it("allows a negative bonus (a deduction)", () => {
    const r = calculatePlayerPoints(baseInput({ bonusPoints: -2 }), INITIAL_RULES);
    expect(r.breakdown.bonus).toBe(-2);
    // appearance 2 + conceded bonus 5 - 2 = 5
    expect(r.basePoints).toBe(5);
  });

  it("is doubled for the captain like every other component", () => {
    const r = calculatePlayerPoints(
      baseInput({ bonusPoints: 4, isCaptain: true }),
      INITIAL_RULES,
    );
    // appearance 2 + conceded bonus 5 + bonus 4 = 11
    expect(r.basePoints).toBe(11);
    expect(r.finalPoints).toBe(22);
  });

  it("is zeroed out for a non-appearance like every other component", () => {
    const r = calculatePlayerPoints(
      baseInput({ appearance: false, bonusPoints: 10 }),
      INITIAL_RULES,
    );
    expect(r.breakdown.bonus).toBe(0);
    expect(r.basePoints).toBe(0);
  });

  it("rejects bonus points outside [-20, 20]", () => {
    expect(() => calculatePlayerPoints(baseInput({ bonusPoints: 21 }), INITIAL_RULES)).toThrow();
    expect(() => calculatePlayerPoints(baseInput({ bonusPoints: -21 }), INITIAL_RULES)).toThrow();
  });
});

describe("calculatePlayerPoints — validation", () => {
  it("rejects negative goals", () => {
    expect(() => calculatePlayerPoints(baseInput({ goals: -1 }), INITIAL_RULES)).toThrow();
  });
  it("rejects negative assists", () => {
    expect(() => calculatePlayerPoints(baseInput({ assists: -1 }), INITIAL_RULES)).toThrow();
  });
  it("rejects negative goals conceded", () => {
    expect(() => calculatePlayerPoints(baseInput({ goalsConceded: -1 }), INITIAL_RULES)).toThrow();
  });
});

describe("deriveResult", () => {
  it("higher score wins", () => {
    expect(deriveResult(6, 4)).toBe("WIN");
    expect(deriveResult(4, 6)).toBe("LOSS");
  });
  it("equal score draws", () => {
    expect(deriveResult(5, 5)).toBe("DRAW");
  });
  it("0-0 is a draw", () => {
    expect(deriveResult(0, 0)).toBe("DRAW");
  });
});

describe("validateFormation", () => {
  it("accepts 3-3-1", () => {
    const positions = ["DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD"] as const;
    expect(validateFormation([...positions]).valid).toBe(true);
  });
  it("accepts 3-2-2", () => {
    const positions = ["DEF", "DEF", "DEF", "MID", "MID", "FWD", "FWD"] as const;
    expect(validateFormation([...positions]).valid).toBe(true);
  });
  it("accepts 2-3-2", () => {
    const positions = ["DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD"] as const;
    expect(validateFormation([...positions]).valid).toBe(true);
  });
  it("rejects 4-2-1", () => {
    const positions = ["DEF", "DEF", "DEF", "DEF", "MID", "MID", "FWD"] as const;
    expect(validateFormation([...positions]).valid).toBe(false);
  });
  it("rejects fewer than 7 players", () => {
    const positions = ["DEF", "DEF", "MID", "MID", "FWD"] as const;
    expect(validateFormation([...positions]).valid).toBe(false);
  });
  it("rejects more than 7 players", () => {
    const positions = ["DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"] as const;
    expect(validateFormation([...positions]).valid).toBe(false);
  });
  it("rejects 1-5-1 (out of bounds on both ends)", () => {
    const positions = ["DEF", "MID", "MID", "MID", "MID", "MID", "FWD"] as const;
    expect(validateFormation([...positions]).valid).toBe(false);
  });
  it("rejects 3-1-3 (too many forwards, too few mids)", () => {
    const positions = ["DEF", "DEF", "DEF", "MID", "FWD", "FWD", "FWD"] as const;
    expect(validateFormation([...positions]).valid).toBe(false);
  });
});

describe("findDuplicateIds", () => {
  it("finds no duplicates in a unique list", () => {
    expect(findDuplicateIds(["a", "b", "c"])).toEqual([]);
  });
  it("finds a duplicate", () => {
    expect(findDuplicateIds(["a", "b", "a"])).toEqual(["a"]);
  });
});
