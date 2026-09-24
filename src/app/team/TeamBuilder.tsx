"use client";

import { useActionState, useMemo, useState } from "react";
import { saveTeamAction } from "@/app/actions/team";
import type { ActionResult } from "@/app/actions/auth";
import { validateFormation, type Position } from "@/lib/scoring";
import {
  Card,
  Field,
  TextInput,
  PrimaryButton,
  ErrorText,
  SuccessText,
  Badge,
} from "@/components/ui";
import PitchView from "@/components/PitchView";

export interface BuilderPlayer {
  id: string;
  name: string;
  position: Position;
  price: number;
  latestGwPoints: number;
  totalPoints: number;
}

const POSITIONS: Position[] = ["DEF", "MID", "FWD"];
const POSITION_LABEL: Record<Position, string> = {
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

const initialState: ActionResult = {};

export default function TeamBuilder({
  players,
  initialSelectedIds,
  initialCaptainId,
  initialTeamName,
  budget,
  editable,
  deadlineMessage,
}: {
  players: BuilderPlayer[];
  initialSelectedIds: string[];
  initialCaptainId: string | null;
  initialTeamName: string;
  budget: number;
  editable: boolean;
  deadlineMessage: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveTeamAction, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));
  const [captainId, setCaptainId] = useState<string>(initialCaptainId ?? "");
  const [teamName, setTeamName] = useState(initialTeamName);
  const [filter, setFilter] = useState<Position | "ALL">("ALL");

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const selectedPlayers = useMemo(
    () => [...selected].map((id) => playersById.get(id)).filter((p): p is BuilderPlayer => !!p),
    [selected, playersById],
  );

  const totalCost = selectedPlayers.reduce((sum, p) => sum + p.price, 0);
  const remaining = budget - totalCost;
  const formation = validateFormation(selectedPlayers.map((p) => p.position));

  function toggle(id: string) {
    if (!editable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (captainId === id) setCaptainId("");
      } else {
        if (next.size >= 7) return prev;
        next.add(id);
      }
      return next;
    });
  }

  const visiblePlayers = players.filter((p) => filter === "ALL" || p.position === filter);
  const canSave = editable && selected.size === 7 && formation.valid && remaining >= 0 && !!captainId;

  return (
    <div className="flex flex-col gap-4 pb-28">
      {!editable && deadlineMessage && (
        <div className="rounded-lg bg-black/5 px-4 py-3 text-sm dark:bg-white/10">
          🔒 {deadlineMessage}
        </div>
      )}

      <PitchView
        players={selectedPlayers.map((p) => ({ ...p, isCaptain: captainId === p.id }))}
      />

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Players" value={`${selected.size} / 7`} />
          <Stat
            label="Formation"
            value={
              formation.valid
                ? `${formation.counts.DEF}-${formation.counts.MID}-${formation.counts.FWD}`
                : "Invalid"
            }
          />
          <Stat label="Spent" value={`£${totalCost.toFixed(1)}m`} />
          <Stat
            label="Remaining"
            value={`£${remaining.toFixed(1)}m`}
            tone={remaining < 0 ? "danger" : "default"}
          />
        </div>
      </Card>

      <form action={formAction} className="flex flex-col gap-4">
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="playerIds" value={id} />
        ))}
        <input type="hidden" name="captainId" value={captainId} />

        <Card>
          <Field label="Team name" htmlFor="teamName">
            <TextInput
              id="teamName"
              name="teamName"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              maxLength={40}
              disabled={!editable}
              placeholder="e.g. Thursday Titans"
            />
          </Field>
        </Card>

        {selected.size === 7 && (
          <Card>
            <p className="mb-3 text-sm font-medium">Captain (2x points)</p>
            <div className="flex flex-col gap-2">
              {selectedPlayers.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-card-border px-3 py-2 has-[:checked]:border-gold has-[:checked]:bg-gold/10"
                >
                  <input
                    type="radio"
                    name="captainRadio"
                    checked={captainId === p.id}
                    onChange={() => editable && setCaptainId(p.id)}
                    disabled={!editable}
                  />
                  <span className="flex-1">{p.name}</span>
                  <Badge tone="muted">{p.position}</Badge>
                </label>
              ))}
            </div>
          </Card>
        )}

        {!formation.valid && selected.size > 0 && (
          <ErrorText>{formation.error}</ErrorText>
        )}
        <ErrorText>{state.error}</ErrorText>
        {state.success && <SuccessText>Team saved!</SuccessText>}

        <div className="flex gap-2 rounded-lg border border-card-border p-1">
          {(["ALL", ...POSITIONS] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-md px-2 py-2 text-sm font-medium ${
                filter === f ? "bg-pitch text-white" : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              {f === "ALL" ? "All" : f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted">
          <span className="w-5 shrink-0" aria-hidden="true" />
          <span className="flex-1">Player</span>
          <span className="w-12 shrink-0 text-right">Price</span>
          <span className="w-8 shrink-0 text-right">GW</span>
          <span className="w-10 shrink-0 text-right">Total</span>
        </div>

        <div className="flex flex-col gap-2">
          {POSITIONS.filter((pos) => filter === "ALL" || filter === pos).map((pos) => (
            <div key={pos}>
              {filter === "ALL" && (
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  {POSITION_LABEL[pos]}
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                {visiblePlayers
                  .filter((p) => p.position === pos)
                  .map((p) => {
                    const isSelected = selected.has(p.id);
                    const disabled = !editable || (!isSelected && selected.size >= 7);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                          isSelected
                            ? "border-pitch bg-pitch/10"
                            : "border-card-border"
                        } ${disabled && !isSelected ? "opacity-50" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(p.id)}
                          disabled={disabled}
                          className="h-5 w-5 accent-[var(--pitch)]"
                        />
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="w-12 shrink-0 text-right text-sm text-muted">
                          £{p.price.toFixed(1)}m
                        </span>
                        <span className="w-8 shrink-0 text-right text-sm">{p.latestGwPoints}</span>
                        <span className="w-10 shrink-0 text-right text-sm font-semibold">
                          {p.totalPoints}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-card-border bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-5xl px-1">
            <PrimaryButton type="submit" className="w-full" disabled={!canSave || pending}>
              {pending ? "Saving…" : "Save team"}
            </PrimaryButton>
          </div>
        </div>
      </form>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-lg font-bold ${tone === "danger" ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}

