import type { CSSProperties } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";

// Deterministic spacing and negative delays keep the rain filled on first render.
const drops = Array.from({ length: 84 }, (_, index) => ({
  x: (index * 37 + 3) % 100,
  duration: 9 + (index % 7),
  delay: -((index * 2.7) % 15),
  length: 18 + (index % 5) * 9,
  opacity: 0.2 + (index % 4) * 0.07,
}));

export function AnimatedBackground() {
  const { paused, reduced, pageVisible } = useMotionPreferences();
  return (
    <div
      className="page-ambient"
      aria-hidden="true"
      data-motion={paused || reduced || !pageVisible ? "paused" : "running"}
    >
      <div className="ambient-wash ambient-wash-one" />
      <div className="ambient-wash ambient-wash-two" />
      <div className="ambient-wash ambient-wash-three" />
      {drops.map((drop, index) => (
        <i
          key={index}
          className="ambient-drop"
          style={
            {
              "--drop-x": `calc(${drop.x}% + ${drop.x * 0.6 - 60}vh)`,
              "--drop-duration": `${drop.duration}s`,
              "--drop-delay": `${drop.delay}s`,
              "--drop-length": `${drop.length}px`,
              "--drop-opacity": drop.opacity,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
