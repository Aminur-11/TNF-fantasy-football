import { describe, it, expect } from "vitest";
import { aggregatePlayerStats, type PlayerMatchStatRow } from "../player-stats";

function row(overrides: Partial<PlayerMatchStatRow>): PlayerMatchStatRow {
  return {
    playerId: "p1",
    teamSide: "A",
    appearance: true,
    goals: 0,
    assists: 0,
    motm: false,
    match: { scoreA: 0, scoreB: 0 },
    ...overrides,
  };
}

describe("aggregatePlayerStats", () => {
  it("counts an appearance, goals, assists and MOTM", () => {
    const totals = aggregatePlayerStats([
      row({ goals: 2, assists: 1, motm: true }),
    ]);
    expect(totals.get("p1")).toEqual({
      appearances: 1,
      goals: 2,
      assists: 1,
      wins: 0, // 0-0 is a draw
      goalsConceded: 0,
      motm: 1,
    });
  });

  it("credits a win only when that side actually won", () => {
    const totals = aggregatePlayerStats([
      row({ playerId: "winner", teamSide: "A", match: { scoreA: 3, scoreB: 1 } }),
      row({ playerId: "loser", teamSide: "B", match: { scoreA: 3, scoreB: 1 } }),
      row({ playerId: "drawer", teamSide: "A", match: { scoreA: 2, scoreB: 2 } }),
    ]);
    expect(totals.get("winner")?.wins).toBe(1);
    expect(totals.get("loser")?.wins).toBe(0);
    expect(totals.get("drawer")?.wins).toBe(0);
  });

  it("attributes goals conceded from the opposing side's score", () => {
    const totals = aggregatePlayerStats([
      row({ playerId: "sideA", teamSide: "A", match: { scoreA: 1, scoreB: 4 } }),
      row({ playerId: "sideB", teamSide: "B", match: { scoreA: 1, scoreB: 4 } }),
    ]);
    expect(totals.get("sideA")?.goalsConceded).toBe(4);
    expect(totals.get("sideB")?.goalsConceded).toBe(1);
  });

  it("ignores a non-appearance entirely, regardless of other stats on the row", () => {
    const totals = aggregatePlayerStats([
      row({ appearance: false, goals: 5, assists: 5, motm: true, match: { scoreA: 3, scoreB: 0 } }),
    ]);
    expect(totals.has("p1")).toBe(false);
  });

  it("accumulates totals across multiple matches for the same player", () => {
    const totals = aggregatePlayerStats([
      row({ goals: 1, match: { scoreA: 2, scoreB: 0 } }),
      row({ goals: 2, match: { scoreA: 1, scoreB: 1 } }),
    ]);
    expect(totals.get("p1")).toEqual({
      appearances: 2,
      goals: 3,
      assists: 0,
      wins: 1,
      goalsConceded: 1,
      motm: 0,
    });
  });
});
