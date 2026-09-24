import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui";
import GameweekSelect from "./GameweekSelect";
import MatchList from "./MatchList";
import MatchStatsForm from "./MatchStatsForm";
import type { Position } from "@/lib/scoring";

export default async function RecordStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ gameweek?: string; match?: string; saved?: string }>;
}) {
  const params = await searchParams;

  const gameweeks = await prisma.gameweek.findMany({ orderBy: { number: "desc" } });
  if (gameweeks.length === 0) {
    return (
      <EmptyState
        title="No gameweeks yet"
        description="Create a gameweek in Admin > Gameweeks before recording match stats."
      />
    );
  }

  const defaultGameweek =
    gameweeks.find((g) => g.status === "LOCKED") ??
    gameweeks.find((g) => g.status === "OPEN") ??
    gameweeks[0];
  const selectedGameweekId = params.gameweek ?? defaultGameweek.id;
  const selectedGameweek =
    gameweeks.find((g) => g.id === selectedGameweekId) ?? defaultGameweek;

  const [matches, players] = await Promise.all([
    prisma.match.findMany({
      where: { gameweekId: selectedGameweek.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.player.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }),
  ]);

  // Always resolve to an EXPLICIT `match` param before rendering. Deriving
  // "new vs existing" from `matches.length` when the param is absent is
  // unstable: saving a brand-new match changes that length without changing
  // the URL, which would silently flip this page's selection (and the
  // MatchStatsForm `key` below) out from under an in-flight save, remounting
  // the form and wiping its just-set success state before it's ever shown.
  if (!params.match) {
    const target = matches[0]?.id ?? "new";
    redirect(`/admin/record-stats?gameweek=${selectedGameweek.id}&match=${target}`);
  }

  const isNew = params.match === "new";
  const selectedMatchId = isNew ? null : params.match;

  const selectedMatch = selectedMatchId
    ? await prisma.match.findUnique({
        where: { id: selectedMatchId },
        include: { playerStats: true },
      })
    : null;

  const locked = selectedGameweek.status === "COMPLETE";

  return (
    <div className="flex flex-col gap-4">
      <GameweekSelect
        gameweeks={gameweeks.map((g) => ({ id: g.id, number: g.number, status: g.status }))}
        selectedId={selectedGameweek.id}
      />

      {locked && (
        <div className="rounded-lg bg-gold/10 px-4 py-3 text-sm">
          🔒 Gameweek {selectedGameweek.number} is complete. Reopen it from Admin → Gameweeks to
          edit stats.
        </div>
      )}

      <MatchList
        gameweekId={selectedGameweek.id}
        matches={matches.map((m) => ({
          id: m.id,
          teamAName: m.teamAName,
          teamBName: m.teamBName,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
        }))}
        selectedMatchId={isNew ? "new" : selectedMatchId}
        disabled={locked}
      />

      <MatchStatsForm
        key={`${selectedGameweek.id}-${selectedMatchId ?? "new"}`}
        gameweekId={selectedGameweek.id}
        players={players.map((p) => ({ id: p.id, name: p.name, position: p.position as Position }))}
        existingMatch={
          selectedMatch
            ? {
                id: selectedMatch.id,
                teamAName: selectedMatch.teamAName,
                teamBName: selectedMatch.teamBName,
                scoreA: selectedMatch.scoreA,
                scoreB: selectedMatch.scoreB,
                stats: selectedMatch.playerStats.map((s) => ({
                  playerId: s.playerId,
                  teamSide: s.teamSide,
                  appearance: s.appearance,
                  goals: s.goals,
                  assists: s.assists,
                  motm: s.motm,
                  bonusPoints: s.bonusPoints,
                })),
              }
            : null
        }
        disabled={locked}
        justSaved={params.saved === "1"}
      />
    </div>
  );
}
