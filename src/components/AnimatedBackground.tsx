import { useMotionPreferences } from "@/components/MotionProvider";

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
    </div>
  );
}
