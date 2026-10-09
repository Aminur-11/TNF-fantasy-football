import { requirePageUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { aggregatePlayerStats } from "@/lib/player-stats";
import { Card, EmptyState } from "@/components/ui";
import type { Position } from "@/lib/scoring";
import StatsTable from "./StatsTable";

export default async function StatsPage() {
  await requirePageUser();

  const [players, statRows] = await Promise.all([
    prisma.player.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }),
    prisma.playerMatchStat.findMany({
      where: { appearance: true },
      select: {
        playerId: true,
        teamSide: true,
        appearance: true,
        goals: true,
        assists: true,
        motm: true,
        match: { select: { scoreA: true, scoreB: true } },
      },
    }),
  ]);

  if (players.length === 0) {
    return (
      <EmptyState
        title="No players yet"
        description="Stats will appear here once players are added and match stats are recorded."
      />
    );
  }

  const totals = aggregatePlayerStats(statRows);

  const rows = players
    .map((p) => {
      const t = totals.get(p.id);
      const goals = t?.goals ?? 0;
      const assists = t?.assists ?? 0;
      return {
        id: p.id,
        name: p.name,
        position: p.position as Position,
        appearances: t?.appearances ?? 0,
        goals,
        assists,
        totalGA: goals + assists,
        wins: t?.wins ?? 0,
        goalsConceded: t?.goalsConceded ?? 0,
        motm: t?.motm ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.goals - a.goals || b.appearances - a.appearances || a.name.localeCompare(b.name),
    );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Stats</h1>
        <p className="text-sm text-muted">Career stats across every recorded match.</p>
      </div>

      <Card className="overflow-x-auto p-0">
        <StatsTable players={rows} />
      </Card>
    </div>
  );
}
