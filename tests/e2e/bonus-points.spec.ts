import { test, expect, type Page } from "@playwright/test";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./global-setup";
import { randomUsername, fmtDateTimeLocal, nextGameweekNumber, ensureNoOpenGameweek } from "./helpers";

// Admins can award (or deduct) discretionary bonus points per player when
// recording match stats, on top of the formula-driven goals/assists/MOTM
// stats. This proves the value entered in Record Stats round-trips through
// to the manager's points breakdown untouched — the bonus is a flat
// add-on, independent of position or any other scoring-rule coefficient,
// so we only assert on the "Bonus" cell itself rather than a computed
// total (which other specs' rule edits could otherwise make fragile).

const MANAGER_PASSWORD = "BonusTest123!";
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

test.describe.serial("Discretionary bonus points", () => {
  let gwNumber: number;
  const managerUsername = randomUsername("bonus");
  const teamName = `Bonus FC ${managerUsername}`;

  test("setup — create a gameweek and a manager's team", async ({ page }) => {
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
  });

  test("admin awards a positive bonus and a negative bonus (deduction)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/record-stats");
    await page.locator("select").selectOption({ label: `Gameweek ${gwNumber} (OPEN)` });
    // Selecting a gameweek triggers a client-side navigation that the
    // server follows up with a redirect to append an explicit `match`
    // param (see admin/record-stats/page.tsx) — wait for that to settle,
    // otherwise the remount below wipes an in-flight search/selection.
    await page.waitForURL(/match=/);
    await page.waitForLoadState("networkidle");

    await page.locator("#playerSearch").fill("E2E Fwd One");
    await page.getByRole("button", { name: "→ Team A" }).first().click();
    await page.locator("#playerSearch").fill("E2E Mid One");
    await page.getByRole("button", { name: "→ Team A" }).first().click();
    await page.locator("#playerSearch").fill("");

    const fwdRow = page.locator(".rounded-lg.border", { hasText: "E2E Fwd One" }).first();
    const fwdBonusPlus = fwdRow.locator("span", { hasText: "Bonus" }).locator("..").getByRole("button", { name: "+", exact: true });
    for (let i = 0; i < 3; i++) await fwdBonusPlus.click(); // +3 bonus

    const midRow = page.locator(".rounded-lg.border", { hasText: "E2E Mid One" }).first();
    const midBonusMinus = midRow.locator("span", { hasText: "Bonus" }).locator("..").getByRole("button", { name: "−", exact: true });
    for (let i = 0; i < 2; i++) await midBonusMinus.click(); // -2 bonus

    await page.getByRole("button", { name: "Save stats" }).click();
    await expect(page.getByText("Stats saved")).toBeVisible();
  });

  test("the bonus shows up correctly on the manager's dashboard breakdown", async ({ page }) => {
    await loginAsManager(page, managerUsername);
    await page.goto("/dashboard");

    const table = page.locator("table");
    const fwdRow = table.locator("tr", { hasText: "E2E Fwd One" });
    const midRow = table.locator("tr", { hasText: "E2E Mid One" });

    // Bonus is the 6th data column (Player, App, Goals, Assists, MOTM, Result, Conceded, Bonus, ...).
    await expect(fwdRow.locator("td").nth(7)).toHaveText("3");
    await expect(midRow.locator("td").nth(7)).toHaveText("-2");
  });
});
