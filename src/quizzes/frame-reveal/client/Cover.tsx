import { motion, useReducedMotion } from "motion/react";
import { useMemo, useRef } from "react";
import { seededRandom, shuffle } from "@/shared/random";
import type { Rect, RevealAnimation } from "../schema";
import { buildShards } from "./geometry";

const pct = (n: number) => `${n * 100}%`;

type Props = { rect: Rect; phase: "hidden" | "revealed"; animation: RevealAnimation; seed: string };

export function Cover({ rect, phase, animation, seed }: Props) {
  const reduced = useReducedMotion();
  // A screen that joins after the reveal must not replay the animation.
  const mountedRevealed = useRef(phase === "revealed");
  if (phase === "hidden") mountedRevealed.current = false;
  if (phase === "revealed" && mountedRevealed.current) return null;
  return (
    <div
      data-testid="cover"
      className="pointer-events-none absolute"
      style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
    >
      {phase === "hidden" ? (
        <div className="absolute inset-0 bg-black" />
      ) : (
        <Reveal animation={reduced ? "dissolve" : animation} seed={seed} />
      )}
    </div>
  );
}

function Reveal({ animation, seed }: { animation: RevealAnimation; seed: string }) {
  const block = "absolute inset-0 bg-black";
  switch (animation) {
    case "dissolve":
      return (
        <motion.div
          className={block}
          initial={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
          animate={{ opacity: 0, filter: "blur(18px)", scale: 1.08 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      );
    case "collapse":
      return (
        <motion.div
          className={block}
          initial={{ scale: 1, rotate: 0, opacity: 1 }}
          animate={{ scale: 0, rotate: 200, opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.6, -0.28, 0.74, 0.05] }}
        />
      );
    case "flyaway":
      return (
        <motion.div
          className={block}
          initial={{ x: 0, y: 0, rotate: 0 }}
          animate={{ x: "160%", y: "-140%", rotate: 35, opacity: 0 }}
          transition={{ duration: 0.9, ease: [0.5, 0, 0.75, 0] }}
        />
      );
    case "curtain":
      return (
        <>
          <motion.div
            className="absolute inset-y-0 left-0 w-[50.5%] bg-black"
            animate={{ x: "-101%" }}
            transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 w-[50.5%] bg-black"
            animate={{ x: "101%" }}
            transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1], delay: 0.05 }}
          />
        </>
      );
    case "pixels":
      return <Pixels seed={seed} />;
    case "shatter":
      return <Shatter seed={seed} />;
  }
}

const GRID = 8;

function Pixels({ seed }: { seed: string }) {
  const order = useMemo(
    () =>
      shuffle(
        Array.from({ length: GRID * GRID }, (_, i) => i),
        seededRandom(seed),
      ),
    [seed],
  );
  return (
    <>
      {order.map((cell, rank) => (
        <motion.div
          key={cell}
          className="absolute bg-black"
          style={{
            left: pct((cell % GRID) / GRID),
            top: pct(Math.floor(cell / GRID) / GRID),
            width: `calc(${100 / GRID}% + 1px)`,
            height: `calc(${100 / GRID}% + 1px)`,
          }}
          animate={{ opacity: 0, scale: 0.3 }}
          transition={{ delay: (rank / (GRID * GRID)) * 0.9, duration: 0.22, ease: "easeIn" }}
        />
      ))}
    </>
  );
}

function Shatter({ seed }: { seed: string }) {
  const shards = useMemo(() => buildShards(seed, 12), [seed]);
  return (
    <>
      {shards.map((s) => (
        <motion.div
          key={`${s.cx}:${s.cy}`}
          className="absolute inset-0 bg-black"
          style={{
            clipPath: `polygon(${s.points.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(", ")})`,
            transformOrigin: `${s.cx * 100}% ${s.cy * 100}%`,
          }}
          animate={{ x: pct(s.dx), y: pct(s.dy), rotate: s.rotate, opacity: 0 }}
          transition={{
            delay: 0.12 + s.delay,
            duration: 1.1,
            ease: [0.55, 0, 1, 0.45],
            opacity: { delay: 0.6 + s.delay, duration: 0.6 },
          }}
        />
      ))}
      <motion.div
        className="absolute inset-0 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ duration: 0.25 }}
      />
    </>
  );
}
