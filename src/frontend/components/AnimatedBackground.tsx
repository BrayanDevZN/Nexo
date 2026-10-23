import type { CSSProperties } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";

// Deterministic spacing keeps the rain filled on first render. Every drop keeps its own column,
// length, opacity and starting point along its fall. The drops share three falling layers (at
// different speeds), so the browser runs three animations instead of eighty-four.
const LAYER_DURATIONS = [10, 12.5, 15];
const drops = Array.from({ length: 84 }, (_, index) => ({
  layer: index % LAYER_DURATIONS.length,
  x: (index * 37 + 3) % 100,
  // Where the drop starts along its fall (0 = top, 1 = bottom), like the old negative delays.
  start: (((index * 2.7) % 15) / 15 + (index % 7) * 0.031) % 1,
  length: 18 + (index % 5) * 9,
  opacity: 0.2 + (index % 4) * 0.07,
  extra: index >= 48,
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
      {LAYER_DURATIONS.map((duration, layer) => (
        <div
          key={layer}
          className="ambient-rain"
          style={{ "--rain-duration": `${duration}s` } as CSSProperties}
        >
          {drops
            .filter((drop) => drop.layer === layer)
            // A second copy one fall behind makes the loop seamless.
            .flatMap((drop) => [0, -1].map((shift) => ({ drop, shift })))
            .map(({ drop, shift }) => (
              <i
                key={`${drop.x}-${drop.start}-${shift}`}
                className={
                  drop.extra ? "ambient-drop ambient-drop-extra" : "ambient-drop"
                }
                style={
                  {
                    "--drop-x": `calc(${drop.x}% + ${drop.x * 0.6 - 60}vh)`,
                    "--drop-progress": drop.start + shift,
                    "--drop-length": `${drop.length}px`,
                    "--drop-opacity": drop.opacity,
                  } as CSSProperties
                }
              />
            ))}
        </div>
      ))}
    </div>
  );
}
