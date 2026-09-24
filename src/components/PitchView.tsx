import type { Position } from "@/lib/scoring";
import PlayerShirt from "@/components/PlayerShirt";

export interface PitchViewPlayer {
  id: string;
  name: string;
  position: Position;
  isCaptain: boolean;
  points?: number;
}

export default function PitchView({ players }: { players: PitchViewPlayer[] }) {
  const rows: Position[] = ["FWD", "MID", "DEF"];

  return (
    <div
      className="relative overflow-hidden rounded-xl p-3 sm:p-4"
      style={{
        background:
          "repeating-linear-gradient(to bottom, #1e7d3c 0, #1e7d3c 12.5%, #24903f 12.5%, #24903f 25%)",
      }}
    >
      {/* Pitch markings */}
      <div className="pointer-events-none absolute inset-3 sm:inset-4" aria-hidden="true">
        <div className="absolute inset-0 rounded-sm border-2 border-white/40" />
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/40" />
        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40 sm:h-20 sm:w-20" />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
        <div className="absolute left-1/2 top-0 h-[16%] w-[46%] -translate-x-1/2 border-x-2 border-b-2 border-white/40" />
        <div className="absolute bottom-0 left-1/2 h-[16%] w-[46%] -translate-x-1/2 border-x-2 border-t-2 border-white/40" />
      </div>

      {/* Players */}
      <div className="relative flex flex-col justify-between gap-3 py-2 sm:py-3">
        {rows.map((pos) => (
          <div key={pos} className="flex flex-wrap justify-center gap-3 sm:gap-5">
            {players
              .filter((p) => p.position === pos)
              .map((p) => (
                <div key={p.id} className="flex flex-col items-center gap-1">
                  <PlayerShirt isCaptain={p.isCaptain} />
                  <span className="max-w-[72px] truncate rounded bg-pitch-dark/80 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white sm:max-w-[88px] sm:text-xs">
                    {p.name.split(" ").slice(-1)[0]}
                  </span>
                  {p.points !== undefined && (
                    <span className="rounded bg-gold px-1.5 py-0.5 text-center text-[10px] font-bold text-pitch-dark sm:text-xs">
                      {p.points} pts
                    </span>
                  )}
                </div>
              ))}
            {players.filter((p) => p.position === pos).length === 0 && (
              <div className="text-xs text-white/50">—</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
