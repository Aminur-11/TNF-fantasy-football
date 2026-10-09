"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import type { Position } from "@/lib/scoring";

export interface StatsRow {
  id: string;
  name: string;
  position: Position;
  appearances: number;
  goals: number;
  assists: number;
  totalGA: number;
  wins: number;
  goalsConceded: number;
  motm: number;
}

type ColumnKey = Exclude<keyof StatsRow, "id" | "position">;

interface Column {
  key: ColumnKey;
  label: string;
}

// Rendered in this order; "name" is left-aligned, the rest are numeric and
// right-aligned (see the `th`/`td` className below).
const COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "appearances", label: "App" },
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "totalGA", label: "Total G/A" },
  { key: "wins", label: "Wins" },
  { key: "goalsConceded", label: "Conceded" },
  { key: "motm", label: "MOTM" },
];

type SortDir = "asc" | "desc";

export default function StatsTable({ players }: { players: StatsRow[] }) {
  // null = back to the server's default order (goals desc, then
  // appearances, then name) — the third click of any column returns here.
  const [sort, setSort] = useState<{ key: ColumnKey; dir: SortDir } | null>(null);

  function handleSort(key: ColumnKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  const rows = useMemo(() => {
    if (!sort) return players;
    const { key, dir } = sort;
    return [...players].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : (av as number) - (bv as number);
      return dir === "asc" ? cmp : -cmp;
    });
  }, [players, sort]);

  return (
    <table className="w-full min-w-[720px] text-sm">
      <thead>
        <tr className="border-b border-card-border text-left text-xs uppercase tracking-wide text-muted">
          {COLUMNS.map((col) => {
            const isSorted = sort?.key === col.key;
            return (
              <th
                key={col.key}
                scope="col"
                aria-sort={isSorted ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                className={`px-4 py-3 ${col.key === "name" ? "" : "text-right"}`}
              >
                <button
                  type="button"
                  onClick={() => handleSort(col.key)}
                  className={`inline-flex select-none items-center gap-1 uppercase tracking-wide text-muted hover:text-foreground ${
                    col.key === "name" ? "" : "flex-row-reverse"
                  }`}
                >
                  {col.label}
                  <span className="w-3 text-[10px]" aria-hidden="true">
                    {isSorted ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
            );
          })}
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
            <td className="px-4 py-3 text-right font-semibold">{r.totalGA}</td>
            <td className="px-4 py-3 text-right">{r.wins}</td>
            <td className="px-4 py-3 text-right">{r.goalsConceded}</td>
            <td className="px-4 py-3 text-right">{r.motm}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
