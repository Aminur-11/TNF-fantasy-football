import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./global-setup";
import { fmtDateTimeLocal, nextGameweekNumber, ensureNoOpenGameweek } from "./helpers";

// "Delete match" lets an admin remove a recorded match (and all its stats/
// points) entirely — needed to rebuild a gameweek from scratch, e.g. after
// editing Game Rules and wanting a gameweek to pick up the new numbers
// (gameweeks are otherwise permanently pinned to whatever rules were active
// when they were created). Also confirms it's unavailable once the
// gameweek is COMPLETE, matching the server-side guard.

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

async function matchCount(gwNumber: number): Promise<number> {
  const prisma = new PrismaClient();
  try {
    const gameweek = await prisma.gameweek.findFirstOrThrow({ where: { number: gwNumber } });
    return prisma.match.count({ where: { gameweekId: gameweek.id } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial("Delete match", () => {
  let gwNumber: number;

  test("setup — create a gameweek and record a match", async ({ page }) => {
    await ensureNoOpenGameweek();
    gwNumber = await nextGameweekNumber();

    await loginAsAdmin(page);
    await createGameweek(page, gwNumber);

    await page.goto("/admin/record-stats");
    await page.locator("select").selectOption({ label: `Gameweek ${gwNumber} (OPEN)` });
    await page.waitForURL(/match=/);
    await page.waitForLoadState("networkidle");

    await page.locator("#playerSearch").fill("E2E Fwd One");
    await page.getByRole("button", { name: "→ Team A" }).first().click();
    await page.locator("#playerSearch").fill("");

    await page.getByRole("button", { name: "Save stats" }).click();
    await expect(page.getByText("Stats saved")).toBeVisible();

    expect(await matchCount(gwNumber)).toBe(1);
  });

  test("deleting the match removes it and its stats", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/record-stats");
    await page.locator("select").selectOption({ label: `Gameweek ${gwNumber} (OPEN)` });
    await page.waitForURL(/match=/);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: "Delete match" })).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete match" }).click();

    // No matches remain, so the page falls back to "new match" mode.
    await page.waitForURL(/match=new/);
    await expect(page.getByRole("heading", { name: "Match" })).toBeVisible();
    // The match tab list should no longer show the old 0-0 match chip.
    await expect(page.getByRole("button", { name: /Team A \d+-\d+ Team B/ })).toHaveCount(0);

    expect(await matchCount(gwNumber)).toBe(0);
  });

  test("delete match is unavailable once the gameweek is complete", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/record-stats");
    await page.locator("select").selectOption({ label: `Gameweek ${gwNumber} (OPEN)` });
    await page.waitForURL(/match=/);
    await page.waitForLoadState("networkidle");

    await page.locator("#playerSearch").fill("E2E Fwd One");
    await page.getByRole("button", { name: "→ Team A" }).first().click();
    await page.getByRole("button", { name: "Save stats" }).click();
    await expect(page.getByText("Stats saved")).toBeVisible();

    await page.goto("/admin/gameweeks");
    const card = page.locator(".rounded-xl", { has: page.locator("p", { hasText: `Gameweek ${gwNumber} ` }) });
    await card.locator('input[type=checkbox]').uncheck();
    await card.getByRole("button", { name: "Lock" }).click();
    await expect(card.getByText("LOCKED")).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: "Complete" }).click();
    await expect(card.getByText("COMPLETE")).toBeVisible();

    await page.goto("/admin/record-stats");
    await page.locator("select").selectOption({ label: `Gameweek ${gwNumber} (COMPLETE)` });
    await page.waitForURL(/match=/);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: "Delete match" })).toHaveCount(0);
  });
});
