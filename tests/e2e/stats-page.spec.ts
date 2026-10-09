import { test, expect, type Page, type Locator } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./global-setup";
import { fmtDateTimeLocal, nextGameweekNumber, ensureNoOpenGameweek } from "./helpers";

// The Stats page lists every player's career appearances/goals/assists/
// wins/goals-conceded/MOTM. Expected totals are computed independently here
// (summing raw PlayerMatchStat + Match rows) rather than importing the
// app's own aggregation helper, so this is a genuine black-box check rather
// than testing the implementation against itself.

async function loginAsAdmin(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ADMIN_USERNAME);
  await page.locator("#password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

async function createGameweek(page: Page, number: number) {
  await page.goto("/admin/gameweeks");
  const now = new Date();
  await page.locator("#number").fill(String(number));
  await page.locator("#startAt").fill(fmtDateTimeLocal(new Date(now.getTime() - 3600_000)));
  await page.locator("#deadline").fill(fmtDateTimeLocal(new Date(now.getTime() + 3600_000)));
  await page.getByRole("button", { name: "Create" }).click();
  await expect(
    page.locator(".rounded-xl", { has: page.locator("p", { hasText: `Gameweek ${number} ` }) }),
  ).toBeVisible();
}

async function computeExpectedTotals(playerName: string) {
  const prisma = new PrismaClient();
  try {
    const player = await prisma.player.findFirstOrThrow({ where: { name: playerName } });
    const stats = await prisma.playerMatchStat.findMany({
      where: { playerId: player.id, appearance: true },
      include: { match: true },
    });

    let appearances = 0;
    let goals = 0;
    let assists = 0;
    let wins = 0;
    let goalsConceded = 0;
    let motm = 0;

    for (const s of stats) {
      const isSideA = s.teamSide === "A";
      const scoreFor = isSideA ? s.match.scoreA : s.match.scoreB;
      const scoreAgainst = isSideA ? s.match.scoreB : s.match.scoreA;
      appearances += 1;
      goals += s.goals;
      assists += s.assists;
      if (scoreFor > scoreAgainst) wins += 1;
      goalsConceded += scoreAgainst;
      if (s.motm) motm += 1;
    }

    return { appearances, goals, assists, wins, goalsConceded, motm };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial("Stats page", () => {
  let gwNumber: number;

  test("requires login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/stats");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("setup — record a known win with a goal, assist and MOTM", async ({ page }) => {
    await ensureNoOpenGameweek();
    gwNumber = await nextGameweekNumber();

    await loginAsAdmin(page);
    await createGameweek(page, gwNumber);

    await page.goto("/admin/record-stats");
    await page.locator("select").selectOption({ label: `Gameweek ${gwNumber} (OPEN)` });
    await page.waitForURL(/match=/);
    await page.waitForLoadState("networkidle");

    // Side A wins 1-0, so this player gets an appearance + a win + a
    // goal + an assist + MOTM, and their opponent gets a loss and a
    // goal conceded.
    const plus = page.getByRole("button", { name: "+", exact: true });
    await plus.nth(0).click(); // score A = 1

    await page.locator("#playerSearch").fill("E2E Def One");
    await page.getByRole("button", { name: "→ Team A" }).first().click();
    await page.locator("#playerSearch").fill("E2E Def Two");
    await page.getByRole("button", { name: "→ Team B" }).first().click();
    await page.locator("#playerSearch").fill("");

    const scorerRow = page.locator(".rounded-lg.border", { hasText: "E2E Def One" }).first();
    await scorerRow.getByRole("button", { name: "+", exact: true }).nth(0).click(); // goal
    await scorerRow.getByRole("button", { name: "+", exact: true }).nth(1).click(); // assist
    await scorerRow.locator("input[type=checkbox]").nth(1).check(); // MOTM

    await page.getByRole("button", { name: "Save stats" }).click();
    await expect(page.getByText("Stats saved")).toBeVisible();
  });

  test("shows correct totals for the winning scorer and the losing side", async ({ page }) => {
    const scorer = await computeExpectedTotals("E2E Def One");
    const loser = await computeExpectedTotals("E2E Def Two");
    expect(scorer.goals).toBeGreaterThan(0);

    await loginAsAdmin(page);
    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();

    const scorerRow = page.locator("tr", { hasText: "E2E Def One" });
    const cols = (row: Locator) => row.locator("td");
    await expect(cols(scorerRow).nth(1)).toHaveText(String(scorer.appearances));
    await expect(cols(scorerRow).nth(2)).toHaveText(String(scorer.goals));
    await expect(cols(scorerRow).nth(3)).toHaveText(String(scorer.assists));
    await expect(cols(scorerRow).nth(4)).toHaveText(String(scorer.goals + scorer.assists));
    await expect(cols(scorerRow).nth(5)).toHaveText(String(scorer.wins));
    await expect(cols(scorerRow).nth(6)).toHaveText(String(scorer.goalsConceded));
    await expect(cols(scorerRow).nth(7)).toHaveText(String(scorer.motm));

    const loserRow = page.locator("tr", { hasText: "E2E Def Two" });
    await expect(cols(loserRow).nth(5)).toHaveText(String(loser.wins));
    await expect(cols(loserRow).nth(6)).toHaveText(String(loser.goalsConceded));
  });

  test("column headers sort the table: asc, then desc, then back to default", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/stats");

    const goalsHeader = page.getByRole("columnheader", { name: /Goals/ });
    const defaultOrder = await page.locator("tbody tr").evaluateAll((rows) =>
      rows.map((r) => r.querySelector("td")?.textContent?.trim()),
    );

    // First click: ascending (lowest goals first).
    await goalsHeader.getByRole("button").click();
    await expect(goalsHeader).toHaveAttribute("aria-sort", "ascending");
    await expect(goalsHeader).toContainText("▲");
    const ascValues = await page.locator("tbody tr").evaluateAll((rows, idx) =>
      rows.map((r) => Number(r.querySelectorAll("td")[idx as number]?.textContent)),
      2,
    );
    expect(ascValues).toEqual([...ascValues].sort((a, b) => a - b));

    // Second click: descending (highest goals first).
    await goalsHeader.getByRole("button").click();
    await expect(goalsHeader).toHaveAttribute("aria-sort", "descending");
    await expect(goalsHeader).toContainText("▼");
    const descValues = await page.locator("tbody tr").evaluateAll((rows, idx) =>
      rows.map((r) => Number(r.querySelectorAll("td")[idx as number]?.textContent)),
      2,
    );
    expect(descValues).toEqual([...descValues].sort((a, b) => b - a));

    // Third click: back to the original (default) order, no arrow shown.
    await goalsHeader.getByRole("button").click();
    await expect(goalsHeader).toHaveAttribute("aria-sort", "none");
    await expect(goalsHeader).not.toContainText("▲");
    await expect(goalsHeader).not.toContainText("▼");
    const resetOrder = await page.locator("tbody tr").evaluateAll((rows) =>
      rows.map((r) => r.querySelector("td")?.textContent?.trim()),
    );
    expect(resetOrder).toEqual(defaultOrder);
  });
});
