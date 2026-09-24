import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./global-setup";
import { fmtDateTimeLocal, nextGameweekNumber, ensureNoOpenGameweek } from "./helpers";

// The "My Team" player list should show each player's latest-gameweek and
// career-total points alongside name/price. Expected values are read back
// from the database (career total = sum of all their FantasyPlayerPoints
// rows; latest GW = their row for the highest-numbered LOCKED/COMPLETE
// gameweek) rather than hardcoded, so this stays correct regardless of
// what other specs have already recorded for this shared fixture player.

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

async function readExpectedColumns(playerName: string) {
  const prisma = new PrismaClient();
  try {
    const player = await prisma.player.findFirstOrThrow({ where: { name: playerName } });
    const totalRows = await prisma.fantasyPlayerPoints.findMany({ where: { playerId: player.id } });
    const totalPoints = totalRows.reduce((sum, r) => sum + r.basePoints, 0);

    const latestGameweek = await prisma.gameweek.findFirst({
      where: { status: { in: ["LOCKED", "COMPLETE"] } },
      orderBy: { number: "desc" },
    });
    const latestGwPoints = latestGameweek
      ? (totalRows.find((r) => r.gameweekId === latestGameweek.id)?.basePoints ?? 0)
      : 0;

    return { price: Number(player.price), totalPoints, latestGwPoints };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial("My Team player list shows GW and total points", () => {
  let gwNumber: number;

  test("setup — record a fresh stat line for a fixture player", async ({ page }) => {
    await ensureNoOpenGameweek();
    gwNumber = await nextGameweekNumber();

    await loginAsAdmin(page);
    await createGameweek(page, gwNumber);
    await page.goto("/admin/gameweeks");
    await page
      .locator(".rounded-xl", { has: page.locator("p", { hasText: `Gameweek ${gwNumber} ` }) })
      .getByRole("button", { name: "Lock" })
      .click();
    await expect(
      page.locator(".rounded-xl", { has: page.locator("p", { hasText: `Gameweek ${gwNumber} ` }) }).getByText(
        "LOCKED",
      ),
    ).toBeVisible();

    await page.goto("/admin/record-stats");
    await page.locator("select").selectOption({ label: `Gameweek ${gwNumber} (LOCKED)` });
    await page.waitForURL(/match=/);
    await page.waitForLoadState("networkidle");

    await page.locator("#playerSearch").fill("E2E Fwd One");
    await page.getByRole("button", { name: "→ Team A" }).first().click();
    await page.locator("#playerSearch").fill("");

    const row = page.locator(".rounded-lg.border", { hasText: "E2E Fwd One" }).first();
    await row.getByRole("button", { name: "+", exact: true }).nth(0).click(); // 1 goal

    await page.getByRole("button", { name: "Save stats" }).click();
    await expect(page.getByText("Stats saved")).toBeVisible();
  });

  test("the player list shows correct price, GW points, and total points", async ({ page }) => {
    const expected = await readExpectedColumns("E2E Fwd One");
    expect(expected.totalPoints).toBeGreaterThan(0);
    expect(expected.latestGwPoints).toBeGreaterThan(0);

    await loginAsAdmin(page);
    await page.goto("/team");
    await page.waitForSelector("input[type=checkbox]");

    const row = page.locator("label", { hasText: "E2E Fwd One" }).first();
    await expect(row.getByText(`£${expected.price.toFixed(1)}m`)).toBeVisible();

    const cells = row.locator("span");
    await expect(cells.nth(2)).toHaveText(String(expected.latestGwPoints)); // GW points cell
    await expect(cells.nth(3)).toHaveText(String(expected.totalPoints)); // Total points cell
  });
});
