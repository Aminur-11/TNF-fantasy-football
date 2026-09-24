import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getLatestScoredGameweek } from "@/lib/gameweek";
import { Card } from "@/components/ui";
import GameweekHistory from "@/components/GameweekHistory";
import PitchView from "@/components/PitchView";
import SquadList from "./SquadList";
import type { ScoringBreakdown } from "@/lib/scoring";

interface PlayerBreakdownEntry {
  playerId: string;
  isCaptain: boolean;
  basePoints: number;
  multiplier: number;
  finalPoints: number;
}

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requirePageUser();
  const { teamId } = await params;

  const team = await prisma.fantasyTeam.findUnique({
    where: { id: teamId },
    include: {
      manager: { select: { username: true } },
      currentPlayers: { include: { player: true } },
      gameweekPoints: {
        include: { gameweek: true },
        orderBy: { gameweek: { number: "desc" } },
      },
    },
  });
  if (!team) notFound();

  const latestGameweek = await getLatestScoredGameweek();
  const squad = latestGameweek
    ? await prisma.fantasyGameweekSquad.findUnique({
        where: { fantasyTeamId_gameweekId: { fantasyTeamId: team.id, gameweekId: latestGameweek.id } },
        include: { players: { include: { player: true } } },
      })
    : null;

  const gwPointsRow = latestGameweek
    ? team.gameweekPoints.find((gp) => gp.gameweekId === latestGameweek.id)
    : undefined;
  const breakdown = (gwPointsRow?.breakdown as unknown as PlayerBreakdownEntry[]) ?? [];
  const breakdownByPlayer = new Map(breakdown.map((b) => [b.playerId, b]));

  const squadPlayerIds = squad
    ? squad.players.map((sp) => sp.playerId)
    : team.currentPlayers.map((sp) => sp.playerId);
  const scoringBreakdownRows =
    latestGameweek && squadPlayerIds.length > 0
      ? await prisma.fantasyPlayerPoints.findMany({
          where: { gameweekId: latestGameweek.id, playerId: { in: squadPlayerIds } },
        })
      : [];
  const scoringBreakdownByPlayer = new Map(
    scoringBreakdownRows.map((r) => [r.playerId, r.breakdown as unknown as ScoringBreakdown]),
  );

  const totalPoints = team.gameweekPoints.reduce((sum, gp) => sum + gp.points, 0);

  const POSITION_ORDER = { DEF: 0, MID: 1, FWD: 2 } as const;

  const displayPlayers = (
    squad
      ? squad.players.map((sp) => ({
          id: sp.playerId,
          name: sp.player.name,
          position: sp.positionAtTime,
          isCaptain: sp.isCaptain,
          points: breakdownByPlayer.get(sp.playerId)?.finalPoints ?? 0,
          basePoints: breakdownByPlayer.get(sp.playerId)?.basePoints ?? 0,
          multiplier: breakdownByPlayer.get(sp.playerId)?.multiplier ?? 1,
          breakdown: scoringBreakdownByPlayer.get(sp.playerId),
        }))
      : team.currentPlayers.map((sp) => ({
          id: sp.playerId,
          name: sp.player.name,
          position: sp.player.position,
          isCaptain: sp.isCaptain,
          points: breakdownByPlayer.get(sp.playerId)?.finalPoints ?? 0,
          basePoints: breakdownByPlayer.get(sp.playerId)?.basePoints ?? 0,
          multiplier: breakdownByPlayer.get(sp.playerId)?.multiplier ?? 1,
          breakdown: scoringBreakdownByPlayer.get(sp.playerId),
        }))
  ).sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/league" className="text-sm underline">
          ← Back to league
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{team.name}</h1>
        <p className="text-sm text-muted">Managed by {team.manager.username}</p>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Overall points</span>
          <span className="text-2xl font-bold">{totalPoints}</span>
        </div>
        {latestGameweek && gwPointsRow && (
          <div className="mt-2 flex items-center justify-between border-t border-card-border pt-2">
            <span className="text-sm text-muted">
              Gameweek {latestGameweek.number}{" "}
              {latestGameweek.status !== "COMPLETE" && "(provisional)"}
            </span>
            <span className="text-xl font-bold">{gwPointsRow.points}</span>
          </div>
        )}
      </Card>

      {displayPlayers.length > 0 && <PitchView players={displayPlayers} />}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">
          Squad{latestGameweek ? ` — Gameweek ${latestGameweek.number}` : ""}
        </h2>
        {displayPlayers.length === 0 ? (
          <p className="text-sm text-muted">This team hasn&apos;t been built yet.</p>
        ) : (
          <SquadList players={displayPlayers} />
        )}
      </Card>

      {team.gameweekPoints.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Gameweek History</h2>
          <GameweekHistory
            entries={team.gameweekPoints.map((gp) => ({
              gameweekId: gp.gameweekId,
              number: gp.gameweek.number,
              status: gp.gameweek.status,
              points: gp.points,
            }))}
          />
        </Card>
      )}
    </div>
  );
}
