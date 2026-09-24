import { requirePageUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getBudget } from "@/lib/league-settings";
import { getCurrentGameweek, getLatestScoredGameweek, isEditable } from "@/lib/gameweek";
import TeamBuilder from "./TeamBuilder";
import type { Position } from "@/lib/scoring";

export default async function TeamPage() {
  const user = await requirePageUser();

  const [players, fantasyTeam, budget, currentGameweek, latestScoredGameweek, totalPointsRows] =
    await Promise.all([
      prisma.player.findMany({
        where: { active: true },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),
      prisma.fantasyTeam.findUnique({
        where: { managerId: user.id },
        include: { currentPlayers: true },
      }),
      getBudget(),
      getCurrentGameweek(),
      getLatestScoredGameweek(),
      prisma.fantasyPlayerPoints.groupBy({ by: ["playerId"], _sum: { basePoints: true } }),
    ]);

  const latestGwRows = latestScoredGameweek
    ? await prisma.fantasyPlayerPoints.findMany({
        where: { gameweekId: latestScoredGameweek.id },
        select: { playerId: true, basePoints: true },
      })
    : [];
  const totalByPlayer = new Map(totalPointsRows.map((r) => [r.playerId, r._sum.basePoints ?? 0]));
  const latestGwByPlayer = new Map(latestGwRows.map((r) => [r.playerId, r.basePoints]));

  const editable = isEditable(currentGameweek);
  const deadlineMessage = currentGameweek
    ? `Gameweek ${currentGameweek.number} deadline has passed. Changes will apply from the next open gameweek.`
    : null;

  const initialSelectedIds = fantasyTeam?.currentPlayers.map((p) => p.playerId) ?? [];
  const initialCaptainId = fantasyTeam?.currentPlayers.find((p) => p.isCaptain)?.playerId ?? null;

  const builderPlayers = players.map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position as Position,
    price: Number(p.price),
    latestGwPoints: latestGwByPlayer.get(p.id) ?? 0,
    totalPoints: totalByPlayer.get(p.id) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Build your team</h1>
        <p className="text-sm text-muted">
          Pick exactly 7 players in a valid formation (3-3-1, 3-2-2 or 2-3-2), stay within
          budget, and choose a captain for 2x points.
        </p>
      </div>
      <TeamBuilder
        players={builderPlayers}
        initialSelectedIds={initialSelectedIds}
        initialCaptainId={initialCaptainId}
        initialTeamName={fantasyTeam?.name ?? ""}
        budget={Number(budget)}
        editable={editable}
        deadlineMessage={deadlineMessage}
      />
    </div>
  );
}
