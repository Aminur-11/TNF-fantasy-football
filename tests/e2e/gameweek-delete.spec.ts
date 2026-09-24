import { test, expect, type Page } from "@playwright/test";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./global-setup";
import { fmtDateTimeLocal, nextGameweekNumber, ensureNoOpenGameweek } from "./helpers";

// Deleting a gameweek is only allowed while it has no recorded matches —
// once a match exists, real scoring history hangs off it and deleting the
// gameweek would silently rewrite everyone's points. This spec proves both
// the happy path (empty gameweek deletes cleanly) and the guard rail
// (a gameweek with a match can't be deleted, server-side, not just hidden).

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
  await expect(gameweekCard(page, number)).toBeVisible();
}

function gameweekCard(page: Page, number: number) {
  return page.locator(".rounded-xl", { has: page.locator("p", { hasText: `Gameweek ${number} ` }) });
}

test.describe.serial("Gameweek deletion", () => {
  let gwNumber: number;

  test("setup — no gameweek left open from a previous run", async () => {
    await ensureNoOpenGameweek();
    gwNumber = await nextGameweekNumber();
  });

  test("admin can delete an empty gameweek", async ({ page }) => {
    await loginAsAdmin(page);
    await createGameweek(page, gwNumber);

    page.once("dialog", (d) => d.accept());
    await gameweekCard(page, gwNumber).getByRole("button", { name: "Delete" }).click();

    await expect(gameweekCard(page, gwNumber)).toHaveCount(0);
  });

  test("a gameweek with a recorded match cannot be deleted", async ({ page }) => {
    const number = gwNumber + 1;
    await loginAsAdmin(page);
    await createGameweek(page, number);

    // No Delete button should even be offered for a fresh, empty gameweek
    // getting a match recorded against it — this checks it's present first.
    await expect(gameweekCard(page, number).getByRole("button", { name: "Delete" })).toBeVisible();

    // Record a minimal match for it (default team names, 0-0, no stats).
    await page.goto("/admin/record-stats");
    await page.locator("select").selectOption({ label: `Gameweek ${number} (OPEN)` });
    // Selecting a gameweek triggers a client navigation the server follows
    // up with a redirect to append an explicit `match` param — wait for it
    // to settle before interacting with the (possibly remounted) form.
    await page.waitForURL(/match=/);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Save stats" }).click();
    await expect(page.getByText("Stats saved")).toBeVisible();

    await page.goto("/admin/gameweeks");
    await expect(
      gameweekCard(page, number).getByRole("button", { name: "Delete" }),
    ).toHaveCount(0);
  });
});
