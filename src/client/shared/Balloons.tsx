import { useId } from "react";

// Hand-picked so the balloons spread across the screen; negative delays put some mid-flight on load.
const BALLOONS = [
  { left: 4, size: 70, color: "oklch(0.68 0.24 350)", rise: 26, delay: -4, sway: 5.5 },
  { left: 14, size: 52, color: "oklch(0.8 0.16 85)", rise: 31, delay: -19, sway: 6.5 },
  { left: 24, size: 62, color: "oklch(0.66 0.2 270)", rise: 23, delay: -12, sway: 4.8 },
  { left: 36, size: 48, color: "oklch(0.75 0.17 160)", rise: 29, delay: -25, sway: 7 },
  { left: 47, size: 66, color: "oklch(0.7 0.2 25)", rise: 27, delay: -1, sway: 5.2 },
  { left: 58, size: 54, color: "oklch(0.72 0.15 220)", rise: 33, delay: -16, sway: 6 },
  { left: 68, size: 74, color: "oklch(0.7 0.22 320)", rise: 25, delay: -9, sway: 5.8 },
  { left: 78, size: 50, color: "oklch(0.82 0.15 110)", rise: 30, delay: -22, sway: 6.8 },
  { left: 87, size: 64, color: "oklch(0.64 0.22 295)", rise: 24, delay: -14, sway: 5 },
  { left: 94, size: 56, color: "oklch(0.74 0.18 55)", rise: 28, delay: -6, sway: 6.2 },
];

export function Balloons() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {BALLOONS.map((b) => (
        <div
          key={b.left}
          className="balloon-rise absolute bottom-0"
          style={{
            left: `${b.left}%`,
            width: b.size,
            animationDuration: `${b.rise}s`,
            animationDelay: `${b.delay}s`,
          }}
        >
          <div
            className="balloon-sway"
            style={{ animationDuration: `${b.sway}s`, animationDelay: `${b.delay}s` }}
          >
            <Balloon color={b.color} sway={b.sway} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Balloon({ color, sway }: { color: string; sway: number }) {
  const shade = useId();
  return (
    <svg viewBox="0 0 60 160" aria-hidden className="block w-full -translate-x-1/2 opacity-90">
      <defs>
        <radialGradient id={shade} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="white" stopOpacity="0.35" />
          <stop offset="60%" stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <g className="balloon-string" style={{ animationDuration: `${sway * 0.6}s` }}>
        <path
          d="M30 74 C24 88 36 100 30 114 C24 128 36 140 30 156"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </g>
      <path d="M30 67 L25.5 75 L34.5 75 Z" fill={color} />
      <path
        d="M30 2 C46 2 56 16 56 34 C56 52 42 66 30 68 C18 66 4 52 4 34 C4 16 14 2 30 2 Z"
        fill={color}
      />
      <path
        d="M30 2 C46 2 56 16 56 34 C56 52 42 66 30 68 C18 66 4 52 4 34 C4 16 14 2 30 2 Z"
        fill={`url(#${shade})`}
      />
      <ellipse
        cx="19"
        cy="20"
        rx="4.5"
        ry="9"
        fill="white"
        fillOpacity="0.5"
        transform="rotate(-25 19 20)"
      />
    </svg>
  );
}
