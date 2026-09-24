"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveMatchStatsAction, type SaveMatchResult } from "@/app/actions/admin-record-stats";
import { deriveResult } from "@/lib/scoring";
import {
  Card,
  Field,
  TextInput,
  PrimaryButton,
  SecondaryButton,
  ErrorText,
  SuccessText,
  Badge,
} from "@/components/ui";
import type { Position } from "@/lib/scoring";

type TeamSide = "A" | "B";

interface PlayerStatLine {
  playerId: string;
  teamSide: TeamSide;
  appearance: boolean;
  goals: number;
  assists: number;
  motm: boolean;
  bonusPoints: number;
}

export interface FormPlayer {
  id: string;
  name: string;
  position: Position;
}

export interface ExistingMatch {
  id: string;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  stats: PlayerStatLine[];
}

const initialState: SaveMatchResult = {};

export default function MatchStatsForm({
  gameweekId,
  players,
  existingMatch,
  disabled,
  justSaved = false,
}: {
  gameweekId: string;
  players: FormPlayer[];
  existingMatch: ExistingMatch | null;
  disabled: boolean;
  justSaved?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveMatchStatsAction, initialState);

  const [teamAName, setTeamAName] = useState(existingMatch?.teamAName ?? "Team A");
  const [teamBName, setTeamBName] = useState(existingMatch?.teamBName ?? "Team B");
  const [scoreA, setScoreA] = useState(existingMatch?.scoreA ?? 0);
  const [scoreB, setScoreB] = useState(existingMatch?.scoreB ?? 0);
  const [lines, setLines] = useState<Map<string, PlayerStatLine>>(
    () => new Map(existingMatch?.stats.map((s) => [s.playerId, s]) ?? []),
  );
  const [search, setSearch] = useState("");

  // Saving a brand-new match navigates the URL to include its new id, which
  // remounts this form (its `key` in the parent page includes the match id)
  // and would otherwise wipe out `state.success` before it's ever seen. The
  // `saved=1` query param survives that remount so the confirmation still
  // shows; we then strip it from the URL without changing the id-based key,
  // so this doesn't trigger a second remount.
  useEffect(() => {
    if (state.success && state.matchId && !existingMatch) {
      router.replace(`/admin/record-stats?gameweek=${gameweekId}&match=${state.matchId}&saved=1`);
    }
  }, [state.success, state.matchId, existingMatch, gameweekId, router]);

  useEffect(() => {
    if (justSaved) {
      const timeout = setTimeout(() => {
        router.replace(`/admin/record-stats?gameweek=${gameweekId}&match=${existingMatch?.id ?? ""}`);
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [justSaved, gameweekId, existingMatch, router]);

  const statsJson = useMemo(() => JSON.stringify([...lines.values()]), [lines]);

  const result = deriveResult(scoreA, scoreB);
  const resultB = deriveResult(scoreB, scoreA);

  function assign(playerId: string, teamSide: TeamSide) {
    setLines((prev) => {
      const next = new Map(prev);
      next.set(playerId, {
        playerId,
        teamSide,
        appearance: true,
        goals: 0,
        assists: 0,
        motm: false,
        bonusPoints: 0,
      });
      return next;
    });
  }

  function unassign(playerId: string) {
    setLines((prev) => {
      const next = new Map(prev);
      next.delete(playerId);
      return next;
    });
  }

  function update(playerId: string, patch: Partial<PlayerStatLine>) {
    setLines((prev) => {
      const line = prev.get(playerId);
      if (!line) return prev;
      const next = new Map(prev);
      next.set(playerId, { ...line, ...patch });
      return next;
    });
  }

  // Reads and writes the count inside the same functional state update, so
  // taps in quick succession (e.g. double-tapping + on a phone) never get
  // dropped to a stale value the way `update(playerId, { goals: line.goals + 1 })`
  // would if `line` came from a render that hasn't committed yet.
  function bumpStat(playerId: string, field: "goals" | "assists", delta: number) {
    setLines((prev) => {
      const line = prev.get(playerId);
      if (!line) return prev;
      const next = new Map(prev);
      next.set(playerId, { ...line, [field]: Math.max(0, line[field] + delta) });
      return next;
    });
  }

  // Bonus points are discretionary and can go negative (a deduction), unlike
  // goals/assists — clamped to the same [-20, 20] range the server enforces.
  function bumpBonus(playerId: string, delta: number) {
    setLines((prev) => {
      const line = prev.get(playerId);
      if (!line) return prev;
      const next = new Map(prev);
      next.set(playerId, {
        ...line,
        bonusPoints: Math.min(20, Math.max(-20, line.bonusPoints + delta)),
      });
      return next;
    });
  }

  function setMotm(playerId: string, value: boolean) {
    setLines((prev) => {
      const next = new Map(prev);
      if (value) {
        for (const [id, line] of next) next.set(id, { ...line, motm: id === playerId });
      } else {
        const line = next.get(playerId);
        if (line) next.set(playerId, { ...line, motm: false });
      }
      return next;
    });
  }

  const filteredPlayers = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const unassignedPlayers = filteredPlayers.filter((p) => !lines.has(p.id));

  const nameById = new Map(players.map((p) => [p.id, p.name]));

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-28">
      <input type="hidden" name="gameweekId" value={gameweekId} />
      {existingMatch && <input type="hidden" name="matchId" value={existingMatch.id} />}
      <input type="hidden" name="statsJson" value={statsJson} />

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Match</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Team A" htmlFor="teamAName">
            <TextInput
              id="teamAName"
              name="teamAName"
              value={teamAName}
              onChange={(e) => setTeamAName(e.target.value)}
              disabled={disabled}
              required
              maxLength={40}
            />
          </Field>
          <Field label="Team B" htmlFor="teamBName">
            <TextInput
              id="teamBName"
              name="teamBName"
              value={teamBName}
              onChange={(e) => setTeamBName(e.target.value)}
              disabled={disabled}
              required
              maxLength={40}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center justify-center gap-4">
          <ScoreStepper
            value={scoreA}
            onIncrement={() => setScoreA((v) => v + 1)}
            onDecrement={() => setScoreA((v) => Math.max(0, v - 1))}
            disabled={disabled}
            name="scoreA"
            label={teamAName}
          />
          <span className="text-2xl font-bold text-muted">–</span>
          <ScoreStepper
            value={scoreB}
            onIncrement={() => setScoreB((v) => v + 1)}
            onDecrement={() => setScoreB((v) => Math.max(0, v - 1))}
            disabled={disabled}
            name="scoreB"
            label={teamBName}
          />
        </div>
        <div className="mt-3 flex justify-center gap-3 text-sm font-medium">
          <span>
            {teamAName}: <Badge tone={result === "WIN" ? "default" : result === "DRAW" ? "muted" : "danger"}>{result}</Badge>
          </span>
          <span>
            {teamBName}: <Badge tone={resultB === "WIN" ? "default" : resultB === "DRAW" ? "muted" : "danger"}>{resultB}</Badge>
          </span>
        </div>
      </Card>

      {(["A", "B"] as TeamSide[]).map((side) => {
        const sideName = side === "A" ? teamAName : teamBName;
        const sideLines = [...lines.values()].filter((l) => l.teamSide === side);
        return (
          <Card key={side}>
            <h2 className="mb-3 text-lg font-semibold">{sideName} players</h2>
            {sideLines.length === 0 && (
              <p className="text-sm text-muted">No players assigned yet.</p>
            )}
            <div className="flex flex-col gap-3">
              {sideLines.map((line) => (
                <PlayerStatRow
                  key={line.playerId}
                  name={nameById.get(line.playerId) ?? "Unknown"}
                  line={line}
                  disabled={disabled}
                  onChange={(patch) => update(line.playerId, patch)}
                  onMotm={(v) => setMotm(line.playerId, v)}
                  onRemove={() => unassign(line.playerId)}
                  onBump={(field, delta) => bumpStat(line.playerId, field, delta)}
                  onBumpBonus={(delta) => bumpBonus(line.playerId, delta)}
                />
              ))}
            </div>
          </Card>
        );
      })}

      {!disabled && (
        <Card>
          <Field label="Add players" htmlFor="playerSearch">
            <TextInput
              id="playerSearch"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <div className="mt-3 flex flex-col gap-1.5">
            {unassignedPlayers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-card-border px-3 py-2"
              >
                <span>
                  {p.name} <Badge tone="muted">{p.position}</Badge>
                </span>
                <div className="flex gap-2">
                  <SecondaryButton type="button" onClick={() => assign(p.id, "A")}>
                    → {teamAName}
                  </SecondaryButton>
                  <SecondaryButton type="button" onClick={() => assign(p.id, "B")}>
                    → {teamBName}
                  </SecondaryButton>
                </div>
              </div>
            ))}
            {unassignedPlayers.length === 0 && (
              <p className="text-sm text-muted">No matching players.</p>
            )}
          </div>
        </Card>
      )}

      <ErrorText>{state.error}</ErrorText>
      {(state.success || justSaved) && (
        <SuccessText>Stats saved — fantasy points recalculated.</SuccessText>
      )}

      {!disabled && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-card-border bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-5xl px-1">
            <PrimaryButton type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving…" : "Save stats"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </form>
  );
}

function ScoreStepper({
  value,
  onIncrement,
  onDecrement,
  disabled,
  name,
  label,
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled: boolean;
  name: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <StepButton disabled={disabled || value <= 0} onClick={onDecrement}>
          −
        </StepButton>
        <input type="hidden" name={name} value={value} />
        <span className="w-10 text-center text-2xl font-bold">{value}</span>
        <StepButton disabled={disabled} onClick={onIncrement}>
          +
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-card-border text-xl font-bold hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function PlayerStatRow({
  name,
  line,
  disabled,
  onChange,
  onMotm,
  onRemove,
  onBump,
  onBumpBonus,
}: {
  name: string;
  line: PlayerStatLine;
  disabled: boolean;
  onChange: (patch: Partial<PlayerStatLine>) => void;
  onMotm: (v: boolean) => void;
  onRemove: () => void;
  onBump: (field: "goals" | "assists", delta: number) => void;
  onBumpBonus: (delta: number) => void;
}) {
  return (
    <div className="rounded-lg border border-card-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">{name}</span>
        {!disabled && (
          <button type="button" onClick={onRemove} className="text-sm text-danger">
            Remove
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={line.appearance}
            disabled={disabled}
            onChange={(e) => onChange({ appearance: e.target.checked })}
            className="h-5 w-5 accent-[var(--pitch)]"
          />
          Appeared
        </label>
        <Counter
          label="Goals"
          value={line.goals}
          disabled={disabled}
          onIncrement={() => onBump("goals", 1)}
          onDecrement={() => onBump("goals", -1)}
        />
        <Counter
          label="Assists"
          value={line.assists}
          disabled={disabled}
          onIncrement={() => onBump("assists", 1)}
          onDecrement={() => onBump("assists", -1)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={line.motm}
            disabled={disabled}
            onChange={(e) => onMotm(e.target.checked)}
            className="h-5 w-5 accent-[var(--gold)]"
          />
          MOTM
        </label>
        <Counter
          label="Bonus"
          value={line.bonusPoints}
          disabled={disabled}
          min={-20}
          max={20}
          onIncrement={() => onBumpBonus(1)}
          onDecrement={() => onBumpBonus(-1)}
        />
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  disabled,
  onIncrement,
  onDecrement,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>{label}</span>
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={onDecrement}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-card-border font-bold disabled:opacity-40"
      >
        −
      </button>
      <span
        className={`w-6 text-center font-semibold ${value < 0 ? "text-danger" : value > 0 && min < 0 ? "text-pitch-dark dark:text-pitch" : ""}`}
      >
        {value > 0 && min < 0 ? `+${value}` : value}
      </span>
      <button
        type="button"
        disabled={disabled || (max !== undefined && value >= max)}
        onClick={onIncrement}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-card-border font-bold disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
