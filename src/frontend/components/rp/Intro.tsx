import { useEffect, useState } from "react";

export const rings = [
  [-60, 0],
  [0, 0],
  [60, 0],
];

export function Letters({ text, delay }: { text: string; delay: number }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {Array.from(text).map((char, index) => (
          <span key={index} className="rp-letter" style={{ animationDelay: `${delay + index * 0.04}s` }}>
            {char === " " ? " " : char}
          </span>
        ))}
      </span>
    </>
  );
}

/** White opening: the name, three interlocked rings that draw themselves, then a round Enter button. */
export function Intro({ onStart, onEnter }: { onStart: () => void; onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    document.documentElement.classList.add("rp-locked");
    return () => document.documentElement.classList.remove("rp-locked");
  }, []);
  const enter = () => {
    if (leaving) return;
    setLeaving(true);
    onStart();
    window.setTimeout(onEnter, 1100);
  };
  return (
    <section className="rp-intro" data-leaving={leaving} aria-label="Abertura">
      <div className="rp-intro-box">
        <p className="rp-intro-line">
          <Letters text="NEXO" delay={0.2} />
        </p>
        <div className="rp-intro-stage">
          <svg className="rp-intro-logo" viewBox="-120 -70 240 140" aria-hidden="true">
            {rings.map(([x, y], set) =>
              [52, 43, 34].map((radius, index) => (
                <circle
                  key={`${set}-${radius}`}
                  cx={x}
                  cy={y}
                  r={radius}
                  pathLength={1}
                  className="rp-ring"
                  style={{ animationDelay: `${0.5 + set * 0.35 + index * 0.18}s` }}
                />
              )),
            )}
          </svg>
          <button type="button" className="rp-enter" onClick={enter}>
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="98" />
              <circle cx="100" cy="100" r="80" />
            </svg>
            <span>Entrar</span>
          </button>
        </div>
        <p className="rp-intro-line rp-intro-sub">
          <Letters text="IA APLICADA AO SEU NEGÓCIO" delay={1.2} />
        </p>
        <p className="rp-intro-note">Role ou deslize para explorar</p>
      </div>
    </section>
  );
}
