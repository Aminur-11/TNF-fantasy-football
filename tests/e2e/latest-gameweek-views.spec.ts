import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./global-setup";
import { randomUsername, fmtDateTimeLocal, nextGameweekNumber, ensureNoOpenGameweek } from "./helpers";

// The league table's "GW Points" column, and a team's detail page, should
// both show the latest gameweek that's actually been scored (LOCKED or
// COMPLETE) — not a currently-OPEN gameweek that has no points yet. This
// proves that: build a team, lock its gameweek (which auto-creates a fresh
// OPEN next gameweek), record stats, and confirm both pages still show the
// locked gameweek's data rather than the new empty one.
//
// Expected point values are read back from the database rather than
// recomputed from the scoring formula, so this stays robust even if other
// specs mutate the active scoring rules (e.g. core-journey.spec.ts).

const MANAGER_PASSWORD = "LatestGwTest123!";
const SQUAD = [
  "E2E Def One",
  "E2E Def Two",
  "E2E Mid One",
  "E2E Mid Two",
  "E2E Mid Three",
  "E2E Fwd One",
  "E2E Fwd Two",
];

async function loginAsAdmin(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ADMIN_USERNAME);
  await page.locator("#password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

async function loginAsManager(page: Page, username: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(MANAGER_PASSWORD);
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

const BREAKDOWN_LABELS: Record<string, string> = {
  appearance: "Appearance",
  goals: "Goals",
  assists: "Assists",
  motm: "MOTM",
  result: "Result",
  goalsConceded: "Conceded",
  bonus: "Bonus",
};

async function readStoredResults(teamName: string, gwNumber: number, captainName: string) {
  const prisma = new PrismaClient();
  try {
    const team = await prisma.fantasyTeam.findFirstOrThrow({
      where: { name: teamName },
      include: { gameweekPoints: { include: { gameweek: true } } },
    });
    const gwRow = team.gameweekPoints.find((gp) => gp.gameweek.number === gwNumber);
    const gameweek = await prisma.gameweek.findFirstOrThrow({ where: { number: gwNumber } });
    const captain = await prisma.player.findFirstOrThrow({ where: { name: captainName } });
    const teamBreakdown = gwRow?.breakdown as unknown as
      | { playerId: string; basePoints: number; multiplier: number; finalPoints: number }[]
      | undefined;
    const captainTeamEntry = teamBreakdown?.find((b) => b.playerId === captain.id);
    const captainPointsRow = await prisma.fantasyPlayerPoints.findFirst({
      where: { gameweekId: gameweek.id, playerId: captain.id },
    });
    return {
      teamPoints: gwRow?.points ?? 0,
      captainPoints: captainTeamEntry?.finalPoints ?? 0,
      captainBasePoints: captainTeamEntry?.basePoints ?? 0,
      captainMultiplier: captainTeamEntry?.multiplier ?? 1,
      captainScoringBreakdown: captainPointsRow?.breakdown as unknown as Record<string, number> | undefined,
    };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial("League table and team detail show the latest scored gameweek", () => {
  let gwNumber: number;
  const managerUsername = randomUsername("latestgw");
  const teamName = `LatestGW FC ${managerUsername}`;

  test("setup — build a team, lock its gameweek, and record stats", async ({ page }) => {
    await ensureNoOpenGameweek();
    gwNumber = await nextGameweekNumber();

    await loginAsAdmin(page);
    await createGameweek(page, gwNumber);

    await page.context().clearCookies();
    await page.goto("/sign-up");
    await page.locator("#username").fill(managerUsername);
    await page.locator("#password").fill(MANAGER_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/team");
    await page.waitForSelector("input[type=checkbox]");
    for (const name of SQUAD) {
      await page.locator("label", { hasText: name }).first().locator("input[type=checkbox]").check();
    }
    await page
      .locator("label", { has: page.locator("input[name=captainRadio]") })
      .filter({ hasText: "E2E Fwd One" })
      .locator("input[type=radio]")
      .check();
    await page.locator("#teamName").fill(teamName);
    await page.getByRole("button", { name: "Save team" }).click();
    await expect(page.getByText("Team saved!")).toBeVisible();

    await loginAsAdmin(page);
    await page.goto("/admin/gameweeks");
    // Leave "Auto-create Gameweek N+1" checked — this is exactly the
    // scenario being tested: a fresh OPEN gameweek exists after locking.
    await page
      .locator(".rounded-xl", { has: page.locator("p", { hasText: `Gameweek ${gwNumber} ` }) })
      .getByRole("button", { name: "Lock" })
      .click();
    await expect(page.getByText(`Next gameweek (#${gwNumber + 1}) was auto-created`)).toBeVisible();

    await page.goto("/admin/record-stats");
    await page.locator("select").selectOption({ label: `Gameweek ${gwNumber} (LOCKED)` });
    await page.waitForURL(/match=/);
    await page.waitForLoadState("networkidle");

    await page.locator("#playerSearch").fill("E2E Fwd One");
    await page.getByRole("button", { name: "→ Team A" }).first().click();
    await page.locator("#playerSearch").fill("");

    const captainRow = page.locator(".rounded-lg.border", { hasText: "E2E Fwd One" }).first();
    const captainGoalsPlus = captainRow.getByRole("button", { name: "+", exact: true }).nth(0);
    await captainGoalsPlus.click(); // 1 goal, whatever it's currently worth

    await page.getByRole("button", { name: "Save stats" }).click();
    await expect(page.getByText("Stats saved")).toBeVisible();
  });

  test("league table's GW Points column shows the locked gameweek, not the new open one", async ({
    page,
  }) => {
    const { teamPoints } = await readStoredResults(teamName, gwNumber, "E2E Fwd One");
    expect(teamPoints).toBeGreaterThan(0); // sanity check the setup actually scored something

    await loginAsManager(page, managerUsername);
    await page.goto("/league");
    await expect(page.getByText(`Showing Gameweek ${gwNumber} points`)).toBeVisible();

    const row = page.locator("tr", { hasText: teamName });
    await expect(row.locator("td").nth(2)).toHaveText(String(teamPoints)); // GW Points column
  });

  test("team detail page shows the locked gameweek's squad and per-player points", async ({ page }) => {
    const { captainPoints } = await readStoredResults(teamName, gwNumber, "E2E Fwd One");
    expect(captainPoints).toBeGreaterThan(0);

    await loginAsManager(page, managerUsername);
    await page.goto("/league");
    await page.getByText(teamName).click();

    await expect(page.getByRole("heading", { name: `Squad — Gameweek ${gwNumber}` })).toBeVisible();

    const captainListRow = page.locator(".rounded-lg.border", { hasText: "E2E Fwd One" });
    await expect(captainListRow.getByText(`${captainPoints} pts`)).toBeVisible();

    // The pitch graphic should show at least one points pill (per-player
    // names are truncated to their last word there, so a specific player
    // isn't uniquely addressable — this just confirms the feature renders).
    await expect(page.getByText(/^\d+ pts$/).first()).toBeVisible();
  });

  test("clicking a player expands a breakdown of how they scored their points", async ({ page }) => {
    const { captainBasePoints, captainMultiplier, captainScoringBreakdown } = await readStoredResults(
      teamName,
      gwNumber,
      "E2E Fwd One",
    );
    expect(captainScoringBreakdown).toBeTruthy();

    await loginAsManager(page, managerUsername);
    await page.goto("/league");
    await page.getByText(teamName).click();

    const captainRow = page.locator(".rounded-lg.border", { hasText: "E2E Fwd One" });
    // Collapsed by default: no breakdown line visible yet.
    await expect(captainRow.getByText("Goals")).not.toBeVisible();

    await captainRow.getByRole("button").click();

    for (const [key, value] of Object.entries(captainScoringBreakdown!)) {
      if (value === 0) continue;
      const label = BREAKDOWN_LABELS[key];
      const line = captainRow.locator("div", { hasText: label }).last();
      await expect(line).toContainText(value > 0 ? `+${value}` : String(value));
    }
    await expect(captainRow.getByText(`Base ${captainBasePoints}`)).toBeVisible();
    if (captainMultiplier > 1) {
      await expect(captainRow.getByText(`× ${captainMultiplier} (C)`)).toBeVisible();
    }

    // Collapses back on a second click.
    await captainRow.getByRole("button").click();
    await expect(captainRow.getByText("Goals")).not.toBeVisible();
  });
});
