import Link from "next/link";
import { requirePageUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getLatestScoredGameweek } from "@/lib/gameweek";
import { Card, Badge, EmptyState } from "@/components/ui";

export default async function LeaguePage() {
  const user = await requirePageUser();
  const [teams, latestGameweek] = await Promise.all([
    prisma.fantasyTeam.findMany({
      include: { manager: { select: { username: true } }, gameweekPoints: true },
    }),
    getLatestScoredGameweek(),
  ]);

  if (teams.length === 0) {
    return <EmptyState title="No fantasy teams yet" description="Teams will appear here once managers build their squads." />;
  }

  const rows = teams.map((t) => {
    const totalPoints = t.gameweekPoints.reduce((sum, gp) => sum + gp.points, 0);
    const bestGwPoints = t.gameweekPoints.reduce((max, gp) => Math.max(max, gp.points), -Infinity);
    const gwPoints = latestGameweek
      ? (t.gameweekPoints.find((gp) => gp.gameweekId === latestGameweek.id)?.points ?? 0)
      : 0;
    return {
      id: t.id,
      name: t.name,
      manager: t.manager.username,
      isMe: false as boolean,
      totalPoints,
      bestGwPoints: bestGwPoints === -Infinity ? 0 : bestGwPoints,
      gwPoints,
    };
  });

  // Deterministic sort: total points desc, then best single-gameweek score
  // desc (rewards consistent form on a tie), then team name A-Z as a final
  // tiebreak so ordering never depends on insertion order.
  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.bestGwPoints !== a.bestGwPoints) return b.bestGwPoints - a.bestGwPoints;
    return a.name.localeCompare(b.name);
  });

  const myTeam = await prisma.fantasyTeam.findUnique({ where: { managerId: user.id } });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">League Table</h1>
        {latestGameweek && (
          <p className="text-sm text-muted">
            Showing Gameweek {latestGameweek.number} points
            {latestGameweek.status !== "COMPLETE" && " (provisional)"}.
          </p>
        )}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Fantasy Team</th>
              <th className="px-4 py-3 text-right">GW Points</th>
              <th className="px-4 py-3 text-right">Total Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className={`border-b border-card-border last:border-0 ${
                  row.id === myTeam?.id ? "bg-pitch/10" : ""
                }`}
              >
                <td className="px-4 py-3 font-semibold">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link href={`/league/${row.id}`} className="font-medium underline">
                    {row.name}
                  </Link>
                  <p className="text-xs text-muted">{row.manager}</p>
                  {row.id === myTeam?.id && <Badge tone="default">You</Badge>}
                </td>
                <td className="px-4 py-3 text-right">{row.gwPoints}</td>
                <td className="px-4 py-3 text-right font-bold">{row.totalPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
