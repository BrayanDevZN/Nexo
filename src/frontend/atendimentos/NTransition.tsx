import { useCallback, useState, type CSSProperties, type ReactNode } from "react";

// The same opening as the site and the panel's area picker: three sets of three concentric rings that draw
// themselves (stroke-dashoffset, so only the graphics card works) and then fade as the screen behind is revealed.
const SETS = [-60, 0, 60];
const RADII = [52, 43, 34];

/** The overlay: the rings draw themselves, hold for a moment, and the veil lifts to show the new screen. */
function RingsOverlay({ quick, onDone }: { quick: boolean; onDone: () => void }) {
  return (
    <div className={"bk-n" + (quick ? " bk-n-quick" : "")} aria-hidden="true" onAnimationEnd={event => { if (event.target === event.currentTarget) onDone(); }}>
      <div className="bk-n-glow" />
      <p className="bk-n-name">NEXO</p>
      <svg className="bk-n-rings" viewBox="-120 -70 240 140">
        {SETS.map((x, set) => RADII.map((radius, index) => (
          <circle key={`${set}-${radius}`} cx={x} cy={0} r={radius} pathLength={1} className="bk-n-ring"
            style={{ "--d": (0.12 + set * 0.2 + index * 0.1).toFixed(2) } as CSSProperties} />
        )))}
      </svg>
    </div>
  );
}

/**
 * `play(change)` covers the screen with the N animation and runs `change` once the veil is opaque, so the new screen
 * appears behind it and is revealed as the letter dissolves. `quick` is the short version for small switches.
 */
export function useNTransition(): { play: (change: () => void, quick?: boolean) => void; overlay: ReactNode } {
  const [state, setState] = useState<{ id: number; quick: boolean }>();
  const play = useCallback((change: () => void, quick = false) => {
    setState(current => ({ id: (current?.id ?? 0) + 1, quick }));
    window.setTimeout(change, quick ? 230 : 330);
  }, []);
  const overlay = state ? <RingsOverlay key={state.id} quick={state.quick} onDone={() => setState(undefined)} /> : null;
  return { play, overlay };
}
