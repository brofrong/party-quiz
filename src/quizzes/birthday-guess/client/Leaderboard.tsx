import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { LeaderRow } from "../schema";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ rows, highlight }: { rows: LeaderRow[]; highlight?: string }) {
  if (!rows.length) {
    return <p className="text-center text-white/70 text-xl">Пока никто не голосовал</p>;
  }
  return (
    <ol data-testid="bg-leaderboard" className="flex w-full max-w-2xl flex-col gap-2">
      {rows.map((r, i) => (
        <motion.li
          key={r.name}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(i, 12) * 0.05 }}
          className={cn(
            "flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-2 text-lg sm:text-2xl",
            r.name === highlight && "ring-2 ring-white",
          )}
        >
          <span className="w-10 text-center font-mono text-white/70 tabular-nums">
            {MEDALS[r.place - 1] ?? r.place}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
          <span className="font-black tabular-nums">{r.score}</span>
        </motion.li>
      ))}
    </ol>
  );
}

/** Final screen: top-3 on a podium, everyone else below. */
export function Podium({ rows, highlight }: { rows: LeaderRow[]; highlight?: string }) {
  const top = rows.filter((r) => r.place <= 3);
  const order = [1, 0, 2]; // 2nd, 1st, 3rd
  const heights = ["h-40 sm:h-56", "h-28 sm:h-40", "h-20 sm:h-28"];
  const byPlace = (p: number) => top.filter((r) => r.place === p);
  const columns = [1, 2, 3].map(byPlace);
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex items-end justify-center gap-3 sm:gap-6">
        {order.map((col) => {
          const group = columns[col] ?? [];
          if (!group.length) return null;
          return (
            <motion.div
              key={col}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + (2 - col) * 0.5, type: "spring", bounce: 0.4 }}
              className="flex w-28 flex-col items-center gap-2 sm:w-48"
            >
              <span className="text-4xl sm:text-6xl">{MEDALS[col]}</span>
              <span className="w-full text-center font-bold text-base leading-tight sm:text-2xl">
                {group.map((r) => r.name).join(", ")}
              </span>
              <div
                className={cn(
                  "flex w-full items-start justify-center rounded-t-2xl bg-white/20 pt-2 font-black text-2xl sm:text-4xl",
                  heights[col],
                )}
              >
                {group[0]?.score}
              </div>
            </motion.div>
          );
        })}
      </div>
      <Leaderboard rows={rows.filter((r) => r.place > 3)} highlight={highlight} />
    </div>
  );
}
