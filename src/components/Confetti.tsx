import { useState, type CSSProperties } from "react";
import "../celebrate.css";

const PIECES = 14;

// Feste Werte statt Zufall: Jeder Burst sieht gleich aus und die Darstellung bleibt stabil.
const SPREAD = Array.from({ length: PIECES }, (_, i) => {
  const angle = (i / PIECES) * Math.PI * 2 + (i % 2) * 0.2;
  const dist = 90 + ((i * 37) % 50);
  return {
    "--dx": `${Math.round(Math.cos(angle) * dist)}px`,
    "--dy": `${Math.round(Math.sin(angle) * dist)}px`,
    "--rot": `${(i % 2 ? 1 : -1) * (180 + i * 25)}deg`,
    "--d": `${(i % 4) * 0.04}s`,
  } as CSSProperties;
});

/** Ein kurzer Konfetti-Stoß, einmal, rein per CSS. Bei reduzierter Bewegung gibt es ihn nicht. */
export function Confetti() {
  const [still] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  if (still) return null;
  return (
    <span className="confetti" aria-hidden="true">
      {SPREAD.map((style, i) => (
        <i key={i} style={style} />
      ))}
    </span>
  );
}
