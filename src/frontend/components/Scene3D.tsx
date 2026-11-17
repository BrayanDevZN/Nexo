import { useEffect } from "react";

// Position (% of the screen), size (px), duration and delay (s) of each floating tile. The first four are the only
// ones kept on a phone (see scene3d.css), so the order is the order of importance.
const TILES = [
  { x: 12, y: 18, size: 150, dur: 26, delay: 0 }, { x: 78, y: 14, size: 120, dur: 31, delay: -9 },
  { x: 66, y: 52, size: 190, dur: 36, delay: -15 }, { x: 20, y: 56, size: 100, dur: 28, delay: -4 },
  { x: 88, y: 70, size: 90, dur: 33, delay: -20 }, { x: 40, y: 8, size: 80, dur: 24, delay: -12 },
  { x: 48, y: 40, size: 130, dur: 40, delay: -26 }, { x: 4, y: 82, size: 110, dur: 30, delay: -7 },
] as const;

/**
 * A light 3D scene behind every screen: a perspective floor that slides toward the viewer and a few glass tiles
 * turning in space. Only `transform` is animated (graphics card, no layout), there are ten elements in all, a phone
 * gets six, a slow device (`data-perf="lite"`) or the "Reduzir animações" choice gets a still floor, and a hidden tab pauses it.
 */
export function Scene3D() {
  useEffect(() => {
    const sync = () => document.documentElement.toggleAttribute("data-tab-hidden", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => { document.removeEventListener("visibilitychange", sync); document.documentElement.removeAttribute("data-tab-hidden"); };
  }, []);
  return (
    <div className="s3d" aria-hidden="true">
      <div className="s3d-floor"><b className="s3d-grid" /></div>
      {TILES.map((tile, index) => (
        <i key={index} className="s3d-tile" style={{ left: tile.x + "%", top: tile.y + "%", "--size": tile.size + "px", "--dur": tile.dur + "s", "--delay": tile.delay + "s" } as React.CSSProperties} />
      ))}
    </div>
  );
}
