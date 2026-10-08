import { requirePageUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { aggregatePlayerStats } from "@/lib/player-stats";
import { Card, Badge, EmptyState } from "@/components/ui";
import type { Position } from "@/lib/scoring";

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
      return {
        id: p.id,
        name: p.name,
        position: p.position as Position,
        appearances: t?.appearances ?? 0,
        goals: t?.goals ?? 0,
        assists: t?.assists ?? 0,
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
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3 text-right">App</th>
              <th className="px-4 py-3 text-right">Goals</th>
              <th className="px-4 py-3 text-right">Assists</th>
              <th className="px-4 py-3 text-right">Wins</th>
              <th className="px-4 py-3 text-right">Conceded</th>
              <th className="px-4 py-3 text-right">MOTM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-card-border last:border-0">
                <td className="px-4 py-3">
                  <span className="font-medium">{r.name}</span>{" "}
                  <Badge tone="muted">{r.position}</Badge>
                </td>
                <td className="px-4 py-3 text-right">{r.appearances}</td>
                <td className="px-4 py-3 text-right font-semibold">{r.goals}</td>
                <td className="px-4 py-3 text-right">{r.assists}</td>
                <td className="px-4 py-3 text-right">{r.wins}</td>
                <td className="px-4 py-3 text-right">{r.goalsConceded}</td>
                <td className="px-4 py-3 text-right">{r.motm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
