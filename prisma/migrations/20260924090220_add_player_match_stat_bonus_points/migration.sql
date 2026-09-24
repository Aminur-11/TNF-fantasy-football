-- Discretionary points an admin can award (or deduct) per player, per match,
-- independent of the formula-driven stats (goals/assists/MOTM/etc).
ALTER TABLE "PlayerMatchStat" ADD COLUMN "bonusPoints" INTEGER NOT NULL DEFAULT 0;
