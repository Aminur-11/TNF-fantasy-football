"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import type { Position, ScoringBreakdown } from "@/lib/scoring";

export interface SquadListPlayer {
  id: string;
  name: string;
  position: Position;
  isCaptain: boolean;
  points: number;
  basePoints: number;
  multiplier: number;
  breakdown?: ScoringBreakdown;
}

const BREAKDOWN_LABELS: Record<keyof ScoringBreakdown, string> = {
  appearance: "Appearance",
  goals: "Goals",
  assists: "Assists",
  motm: "MOTM",
  result: "Result",
  goalsConceded: "Clean Sheet",
  bonus: "Bonus",
};

const BREAKDOWN_ORDER: (keyof ScoringBreakdown)[] = [
  "appearance",
  "goals",
  "assists",
  "motm",
  "result",
  "goalsConceded",
  "bonus",
];

export default function SquadList({ players }: { players: SquadListPlayer[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      {players.map((p) => {
        const isExpanded = expandedId === p.id;
        const nonZeroEntries = p.breakdown
          ? BREAKDOWN_ORDER.filter((key) => p.breakdown![key] !== 0)
          : [];

        return (
          <div key={p.id} className="rounded-lg border border-card-border">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : p.id)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
              aria-expanded={isExpanded}
            >
              <div className="flex items-center gap-2">
                <span>
                  {p.name}
                  {p.isCaptain && <span className="ml-1 text-gold">(C)</span>}
                </span>
                <Badge tone="muted">{p.position}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{p.points} pts</span>
                <span className="text-xs text-muted">{isExpanded ? "▲" : "▼"}</span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-card-border px-3 py-2 text-xs">
                {!p.breakdown ? (
                  <p className="text-muted">No stats recorded for this gameweek.</p>
                ) : nonZeroEntries.length === 0 ? (
                  <p className="text-muted">No points scored.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {nonZeroEntries.map((key) => {
                      const value = p.breakdown![key];
                      return (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-muted">{BREAKDOWN_LABELS[key]}</span>
                          <span className={value < 0 ? "text-danger" : ""}>
                            {value > 0 ? `+${value}` : value}
                          </span>
                        </div>
                      );
                    })}
                    <div className="mt-1 flex items-center justify-between border-t border-card-border pt-1 font-semibold">
                      <span>
                        Base {p.basePoints}
                        {p.multiplier > 1 ? ` × ${p.multiplier} (C)` : ""}
                      </span>
                      <span>{p.points} pts</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
