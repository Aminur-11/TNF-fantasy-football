import Link from "next/link";
import { requirePageUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getCurrentGameweek } from "@/lib/gameweek";
import { Card, Badge, PrimaryButton, EmptyState } from "@/components/ui";
import Countdown from "@/components/Countdown";
import GameweekHistory from "@/components/GameweekHistory";

const STATUS_TONE = {
  OPEN: "default",
  LOCKED: "muted",
  COMPLETE: "gold",
} as const;

export default async function DashboardPage() {
  const user = await requirePageUser();

  const [gameweek, fantasyTeam] = await Promise.all([
    getCurrentGameweek(),
    prisma.fantasyTeam.findUnique({
      where: { managerId: user.id },
      include: {
        currentPlayers: { include: { player: true } },
        gameweekPoints: {
          include: { gameweek: true },
          orderBy: { gameweek: { number: "desc" } },
        },
      },
    }),
  ]);

  const overallPoints =
    fantasyTeam?.gameweekPoints.reduce((sum, gp) => sum + gp.points, 0) ?? 0;
  const gwPoints = gameweek
    ? (fantasyTeam?.gameweekPoints.find((gp) => gp.gameweekId === gameweek.id)?.points ?? null)
    : null;

  const squad =
    fantasyTeam && gameweek
      ? await prisma.fantasyGameweekSquad.findUnique({
          where: {
            fantasyTeamId_gameweekId: { fantasyTeamId: fantasyTeam.id, gameweekId: gameweek.id },
          },
          include: { players: { include: { player: true } } },
        })
      : null;

  const breakdownRows = squad
    ? await prisma.fantasyPlayerPoints.findMany({
        where: {
          gameweekId: gameweek!.id,
          playerId: { in: squad.players.map((p) => p.playerId) },
        },
      })
    : [];
  const breakdownByPlayer = new Map(breakdownRows.map((r) => [r.playerId, r]));
  const captainMultiplier = gameweek?.scoringRuleVersionId
    ? ((await prisma.scoringRuleVersion.findUnique({
        where: { id: gameweek.scoringRuleVersionId },
        select: { captainMultiplier: true },
      }))?.captainMultiplier ?? 2)
    : 2;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user.username}</h1>
        {user.role === "ADMIN" && (
          <p className="text-sm text-muted">
            You have admin access.{" "}
            <Link href="/admin" className="underline">
              Go to Admin →
            </Link>
          </p>
        )}
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Current Gameweek</h2>
          {gameweek && (
            <Badge tone={STATUS_TONE[gameweek.status]}>{gameweek.status}</Badge>
          )}
        </div>
        {gameweek ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xl font-bold">Gameweek {gameweek.number}</p>
              <p className="text-sm text-muted">
                Deadline: {gameweek.deadline.toLocaleString()}
              </p>
              {gameweek.status === "OPEN" && <Countdown target={gameweek.deadline.toISOString()} />}
            </div>
            {gwPoints !== null && (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {gameweek.status === "COMPLETE" ? "GW Points" : "GW Points (provisional)"}
                </p>
                <p className="text-2xl font-bold">{gwPoints}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted">No gameweek has been created yet.</p>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Team</h2>
          <Link href="/team" className="text-sm font-medium text-pitch-dark underline dark:text-pitch">
            {fantasyTeam ? "Edit team" : "Build team"}
          </Link>
        </div>

        {!fantasyTeam || fantasyTeam.currentPlayers.length === 0 ? (
          <EmptyState
            title="Your team is empty"
            description="Build your team to get started."
            action={
              <Link href="/team">
                <PrimaryButton type="button">Build your team</PrimaryButton>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="font-semibold">{fantasyTeam.name}</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {fantasyTeam.currentPlayers.map((sp) => (
                <div
                  key={sp.id}
                  className="flex items-center justify-between rounded-lg border border-card-border px-3 py-2 text-sm"
                >
                  <span>
                    {sp.player.name}
                    {sp.isCaptain && <span className="ml-1 text-gold">(C)</span>}
                  </span>
                  <Badge tone="muted">{sp.player.position}</Badge>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-card-border pt-3">
              <span className="text-sm text-muted">Overall points</span>
              <span className="text-xl font-bold">{overallPoints}</span>
            </div>
          </div>
        )}
      </Card>

      {squad && squad.players.length > 0 && gameweek && (
        <Card className="overflow-x-auto">
          <h2 className="mb-3 text-lg font-semibold">
            Gameweek {gameweek.number} points breakdown
          </h2>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-2">Player</th>
                <th className="py-2 px-2 text-right">App</th>
                <th className="py-2 px-2 text-right">Goals</th>
                <th className="py-2 px-2 text-right">Assists</th>
                <th className="py-2 px-2 text-right">MOTM</th>
                <th className="py-2 px-2 text-right">Result</th>
                <th className="py-2 px-2 text-right">Clean Sheet</th>
                <th className="py-2 px-2 text-right">Bonus</th>
                <th className="py-2 px-2 text-right">Base</th>
                <th className="py-2 px-2 text-right">Captain</th>
                <th className="py-2 pl-2 text-right">Final</th>
              </tr>
            </thead>
            <tbody>
              {squad.players.map((sp) => {
                const row = breakdownByPlayer.get(sp.playerId);
                const b = row?.breakdown as
                  | {
                      appearance: number;
                      goals: number;
                      assists: number;
                      motm: number;
                      result: number;
                      goalsConceded: number;
                      bonus: number;
                    }
                  | undefined;
                const base = row?.basePoints ?? 0;
                const multiplier = sp.isCaptain ? captainMultiplier : 1;
                return (
                  <tr key={sp.id} className="border-b border-card-border last:border-0">
                    <td className="py-2 pr-2 font-medium">
                      {sp.player.name}
                      {sp.isCaptain && <span className="ml-1 text-gold">(C)</span>}
                    </td>
                    <td className="py-2 px-2 text-right">{b?.appearance ?? "—"}</td>
                    <td className="py-2 px-2 text-right">{b?.goals ?? "—"}</td>
                    <td className="py-2 px-2 text-right">{b?.assists ?? "—"}</td>
                    <td className="py-2 px-2 text-right">{b?.motm ?? "—"}</td>
                    <td className="py-2 px-2 text-right">{b?.result ?? "—"}</td>
                    <td className="py-2 px-2 text-right">{b?.goalsConceded ?? "—"}</td>
                    <td className="py-2 px-2 text-right">{b?.bonus ?? "—"}</td>
                    <td className="py-2 px-2 text-right font-semibold">{base}</td>
                    <td className="py-2 px-2 text-right">{multiplier > 1 ? `×${multiplier}` : "—"}</td>
                    <td className="py-2 pl-2 text-right font-bold">{base * multiplier}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {fantasyTeam && fantasyTeam.gameweekPoints.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Gameweek History</h2>
          <GameweekHistory
            entries={fantasyTeam.gameweekPoints.map((gp) => ({
              gameweekId: gp.gameweekId,
              number: gp.gameweek.number,
              status: gp.gameweek.status,
              points: gp.points,
            }))}
          />
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">League</h2>
          <Link href="/league" className="text-sm font-medium text-pitch-dark underline dark:text-pitch">
            View table →
          </Link>
        </div>
      </Card>
    </div>
  );
}
