import "server-only";
import { prisma } from "@/lib/prisma";
import type { Gameweek } from "@prisma/client";

/**
 * Picks the single gameweek most relevant to show on the dashboard: the
 * OPEN one if there is one, otherwise the highest-numbered LOCKED gameweek,
 * otherwise the highest-numbered COMPLETE one, otherwise null.
 */
export async function getCurrentGameweek(): Promise<Gameweek | null> {
  const open = await prisma.gameweek.findFirst({
    where: { status: "OPEN" },
    orderBy: { number: "asc" },
  });
  if (open) return open;

  const locked = await prisma.gameweek.findFirst({
    where: { status: "LOCKED" },
    orderBy: { number: "desc" },
  });
  if (locked) return locked;

  return prisma.gameweek.findFirst({
    where: { status: "COMPLETE" },
    orderBy: { number: "desc" },
  });
}

/**
 * Picks the highest-numbered gameweek that isn't OPEN — i.e. the most
 * recent one with actual (possibly provisional) scoring to show, skipping
 * over a currently-OPEN gameweek that has no points yet. Used for "last
 * gameweek's points/team" views (league table, team detail), as opposed to
 * `getCurrentGameweek()` which is about what a manager should be building
 * towards right now.
 */
export async function getLatestScoredGameweek(): Promise<Gameweek | null> {
  return prisma.gameweek.findFirst({
    where: { status: { in: ["LOCKED", "COMPLETE"] } },
    orderBy: { number: "desc" },
  });
}

/**
 * Whether a manager may currently edit their team/captain/transfers.
 *
 * Blocked only while the most relevant gameweek is actively LOCKED (its
 * match hasn't been recorded yet) or still OPEN but past its deadline. Once
 * a gameweek is COMPLETE, or none exists yet, managers are free to prepare
 * their squad again ahead of whenever the next gameweek opens.
 */
export function isEditable(gameweek: Pick<Gameweek, "status" | "deadline"> | null): boolean {
  if (!gameweek) return true;
  if (gameweek.status === "COMPLETE") return true;
  if (gameweek.status === "LOCKED") return false;
  return new Date() < gameweek.deadline;
}
