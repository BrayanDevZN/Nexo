import type { CSSProperties } from "react";
import { useMotionPreferences } from "@/components/MotionProvider";

const points = [
  [8, 18, 0],
  [24, 72, -8],
  [43, 12, -3],
  [68, 48, -12],
  [90, 24, -5],
  [14, 88, -15],
  [56, 82, -10],
  [82, 91, -6],
  [34, 45, -13],
  [76, 8, -2],
  [6, 53, -11],
  [94, 66, -17],
];

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
      <div className="ambient-grid" />
      {points.map(([x, y, delay], index) => (
        <i
          key={index}
          className="ambient-point"
          style={
            {
              "--point-x": `${x}%`,
              "--point-y": `${y}%`,
              "--point-delay": `${delay}s`,
              "--point-size": `${(index % 3) + 2}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
