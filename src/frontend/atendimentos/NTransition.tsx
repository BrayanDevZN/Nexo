import { useCallback, useState, type CSSProperties, type ReactNode } from "react";

// The Nexo N as a 5x7 grid of blocks (1 = a block). Same idea as the panel's sign-in letter that breaks into cubes,
// but made of 19 plain elements animated with transform and opacity only, so it is light enough for a weak phone.
const N_SHAPE = ["10001", "11001", "11001", "10101", "10011", "10011", "10001"];
const COLORS = ["#6d28d9", "#7c3aed", "#8b5cf6", "#a78bfa", "#5b21b6"];
// A fixed pseudo-random scatter (no Math.random during render): where each block starts and where it flies off to.
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const PIECES = N_SHAPE.flatMap((row, r) => [...row].flatMap((cell, c) => (cell === "1" ? [{ r, c }] : []))).map((piece, i) => ({
  ...piece, i,
  sx: Math.round((hash(i + 1) - 0.5) * 520), sy: Math.round((hash(i + 40) - 0.2) * 420), sr: Math.round((hash(i + 80) - 0.5) * 540),
  ex: Math.round((hash(i + 120) - 0.5) * 360), er: Math.round((hash(i + 160) - 0.5) * 360),
  color: COLORS[i % COLORS.length],
}));

/** The overlay: the blocks fly in and assemble the N, hold for a moment, then dissolve upward and reveal what is behind. */
function NOverlay({ quick, onDone }: { quick: boolean; onDone: () => void }) {
  return (
    <div className={"bk-n" + (quick ? " bk-n-quick" : "")} aria-hidden="true" onAnimationEnd={event => { if (event.target === event.currentTarget) onDone(); }}>
      <div className="bk-n-glow" />
      <div className="bk-n-letter">
        {PIECES.map(piece => (
          <i key={piece.i} className="bk-n-block" style={{
            "--col": piece.c, "--row": piece.r, "--i": piece.i, "--sx": piece.sx + "px", "--sy": piece.sy + "px", "--sr": piece.sr + "deg",
            "--ex": piece.ex + "px", "--er": piece.er + "deg", background: piece.color,
          } as CSSProperties} />
        ))}
      </div>
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
  const overlay = state ? <NOverlay key={state.id} quick={state.quick} onDone={() => setState(undefined)} /> : null;
  return { play, overlay };
}
