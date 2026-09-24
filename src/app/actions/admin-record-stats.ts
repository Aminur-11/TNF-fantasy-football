"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recalculateMatch, recalculateGameweekTeamPoints } from "@/lib/recalc";
import type { ActionResult } from "@/app/actions/auth";

const statLineSchema = z.object({
  playerId: z.string().min(1),
  teamSide: z.enum(["A", "B"]),
  appearance: z.boolean(),
  goals: z.number().int().min(0),
  assists: z.number().int().min(0),
  motm: z.boolean(),
  bonusPoints: z.number().int().min(-20).max(20),
});

const saveMatchSchema = z.object({
  gameweekId: z.string().min(1),
  matchId: z.string().optional(),
  teamAName: z.string().trim().min(1, "Team A needs a name").max(40),
  teamBName: z.string().trim().min(1, "Team B needs a name").max(40),
  scoreA: z.number().int().min(0),
  scoreB: z.number().int().min(0),
  stats: z.array(statLineSchema),
});

export interface SaveMatchResult extends ActionResult {
  matchId?: string;
}

export async function saveMatchStatsAction(
  _prev: SaveMatchResult,
  formData: FormData,
): Promise<SaveMatchResult> {
  await requireAdmin();

  let statsRaw: unknown;
  try {
    statsRaw = JSON.parse(String(formData.get("statsJson") ?? "[]"));
  } catch {
    return { error: "Invalid stats payload" };
  }

  const parsed = saveMatchSchema.safeParse({
    gameweekId: formData.get("gameweekId"),
    matchId: formData.get("matchId") || undefined,
    teamAName: formData.get("teamAName"),
    teamBName: formData.get("teamBName"),
    scoreA: Number(formData.get("scoreA")),
    scoreB: Number(formData.get("scoreB")),
    stats: statsRaw,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const gameweek = await prisma.gameweek.findUnique({ where: { id: data.gameweekId } });
  if (!gameweek) return { error: "Gameweek not found" };
  if (gameweek.status === "COMPLETE") {
    return { error: "This gameweek is complete. Reopen it from Admin > Gameweeks to edit stats." };
  }

  const playerIds = data.stats.map((s) => s.playerId);
  const uniquePlayerIds = new Set(playerIds);
  if (uniquePlayerIds.size !== playerIds.length) {
    return { error: "A player is assigned to a team more than once." };
  }

  const motmCount = data.stats.filter((s) => s.motm).length;
  if (motmCount > 1) {
    return { error: "Only one player can be Man of the Match." };
  }

  const players = await prisma.player.findMany({ where: { id: { in: playerIds } } });
  if (players.length !== playerIds.length) {
    return { error: "One or more assigned players could not be found." };
  }
  const positionById = new Map(players.map((p) => [p.id, p.position]));

  try {
    const matchId = await prisma.$transaction(async (tx) => {
      const match = data.matchId
        ? await tx.match.update({
            where: { id: data.matchId },
            data: {
              teamAName: data.teamAName,
              teamBName: data.teamBName,
              scoreA: data.scoreA,
              scoreB: data.scoreB,
            },
          })
        : await tx.match.create({
            data: {
              gameweekId: data.gameweekId,
              teamAName: data.teamAName,
              teamBName: data.teamBName,
              scoreA: data.scoreA,
              scoreB: data.scoreB,
            },
          });

      // Source-of-truth replace: delete then recreate every stat line for
      // this match so edits never duplicate or accumulate.
      await tx.playerMatchStat.deleteMany({ where: { matchId: match.id } });
      if (data.stats.length > 0) {
        await tx.playerMatchStat.createMany({
          data: data.stats.map((s) => ({
            matchId: match.id,
            playerId: s.playerId,
            teamSide: s.teamSide,
            appearance: s.appearance,
            goals: s.goals,
            assists: s.assists,
            motm: s.motm,
            bonusPoints: s.bonusPoints,
            positionAtTime: positionById.get(s.playerId)!,
          })),
        });
      }

      return match.id;
    });

    await recalculateMatch(matchId);

    revalidatePath("/admin/record-stats");
    revalidatePath("/dashboard");
    revalidatePath("/league");
    return { success: true, matchId };
  } catch {
    return { error: "Failed to save match stats. Please try again." };
  }
}

export async function deleteMatchAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const matchId = String(formData.get("matchId") ?? "");
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { gameweek: true } });
  if (!match) return { error: "Match not found" };
  if (match.gameweek.status === "COMPLETE") {
    return { error: "This gameweek is complete. Reopen it to make changes." };
  }

  await prisma.match.delete({ where: { id: matchId } });
  await recalculateGameweekTeamPoints(match.gameweekId);

  revalidatePath("/admin/record-stats");
  revalidatePath("/dashboard");
  revalidatePath("/league");
  return { success: true };
}
