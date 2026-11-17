import type { SVGProps } from "react";

/** Brand illustrations: hairline cards in the section's own colour plus the violet gradient of the Nexo mark. */
const Defs = ({ id }: { id: string }) => (
  <defs>
    <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#c4b5fd" />
      <stop offset="0.55" stopColor="#7c5cff" />
      <stop offset="1" stopColor="#4a2fe0" />
    </linearGradient>
    <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#7c5cff" />
      <stop offset="1" stopColor="#38bdf8" />
    </linearGradient>
  </defs>
);

const base: SVGProps<SVGSVGElement> = { viewBox: "0 0 400 400", role: "img", fill: "none", xmlns: "http://www.w3.org/2000/svg" };

/** 01: the attendant that never sleeps: a chat with a moon and stars. */
export function ChatArt() {
  return (
    <svg {...base} aria-label="Conversa de atendimento com lua e estrelas" className="il">
      <Defs id="a1" />
      <circle cx="200" cy="200" r="168" className="il-ring" />
      <rect x="118" y="62" width="164" height="276" rx="30" className="il-card" />
      <rect x="178" y="74" width="44" height="6" rx="3" className="il-line" />
      <rect x="136" y="104" width="104" height="38" rx="14" className="il-soft" />
      <rect x="136" y="116" width="62" height="6" rx="3" className="il-line" />
      <rect x="160" y="156" width="104" height="38" rx="14" fill="url(#a1-g)" />
      <rect x="176" y="168" width="62" height="6" rx="3" fill="#fff" opacity="0.85" />
      <rect x="136" y="208" width="84" height="38" rx="14" className="il-soft" />
      <rect x="136" y="220" width="46" height="6" rx="3" className="il-line" />
      <rect x="150" y="260" width="114" height="38" rx="14" fill="url(#a1-g)" />
      <circle cx="176" cy="279" r="9" fill="#fff" opacity="0.9" />
      <path d="M171 279l4 4 7-8" stroke="#6a4cf5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="192" y="274" width="50" height="6" rx="3" fill="#fff" opacity="0.85" />
      <path d="M322 92a46 46 0 1 0 28 66 36 36 0 0 1-28-66z" fill="url(#a1-g)" />
      <circle cx="84" cy="128" r="3" className="il-dot" />
      <circle cx="62" cy="214" r="2.2" className="il-dot" />
      <circle cx="338" cy="248" r="2.6" className="il-dot" />
      <circle cx="94" cy="300" r="2" className="il-dot" />
      <path d="M296 296l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="url(#a1-s)" />
    </svg>
  );
}

/** 02: repetitive work solved: documents go in, a checked list comes out. */
export function FlowArt() {
  return (
    <svg {...base} aria-label="Documentos virando uma lista concluída" className="il">
      <Defs id="a2" />
      <circle cx="200" cy="200" r="168" className="il-ring" />
      <g transform="rotate(-8 112 150)">
        <rect x="56" y="98" width="100" height="124" rx="14" className="il-card" />
        <rect x="72" y="118" width="52" height="6" rx="3" className="il-line" />
        <rect x="72" y="136" width="68" height="6" rx="3" className="il-line" />
        <rect x="72" y="154" width="40" height="6" rx="3" className="il-line" />
      </g>
      <g transform="rotate(6 120 250)">
        <rect x="64" y="212" width="100" height="124" rx="14" className="il-card" />
        <rect x="80" y="232" width="52" height="6" rx="3" className="il-line" />
        <rect x="80" y="250" width="68" height="6" rx="3" className="il-line" />
        <rect x="80" y="268" width="40" height="6" rx="3" className="il-line" />
      </g>
      <path d="M172 200h60" stroke="url(#a2-s)" strokeWidth="3" strokeDasharray="4 8" strokeLinecap="round" className="il-flow" />
      <path d="M226 190l14 10-14 10" stroke="#7c5cff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="226" y="86" width="132" height="228" rx="22" className="il-card" />
      <rect x="244" y="106" width="64" height="8" rx="4" fill="url(#a2-g)" />
      {[142, 190, 238].map((y) => (
        <g key={y}>
          <rect x="244" y={y} width="26" height="26" rx="8" fill="url(#a2-g)" />
          <path d={`M251 ${y + 13}l5 5 9-10`} stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="280" y={y + 5} width="58" height="6" rx="3" className="il-line" />
          <rect x="280" y={y + 16} width="38" height="5" rx="2.5" className="il-line" opacity="0.6" />
        </g>
      ))}
      <rect x="244" y="284" width="96" height="10" rx="5" className="il-soft" />
      <rect x="244" y="284" width="74" height="10" rx="5" fill="url(#a2-s)" />
      <circle cx="338" cy="84" r="22" fill="url(#a2-g)" />
      <path d="M338 72v12l8 5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 03: systems working together: a hub linked to the tools a company already uses. */
export function ConnectArt() {
  const nodes = [
    { x: 200, y: 62, label: "chat" },
    { x: 340, y: 200, label: "table" },
    { x: 200, y: 338, label: "mail" },
    { x: 60, y: 200, label: "calendar" },
  ];
  return (
    <svg {...base} aria-label="Sistemas conectados a um centro" className="il">
      <Defs id="a3" />
      <circle cx="200" cy="200" r="168" className="il-ring" />
      <circle cx="200" cy="200" r="104" className="il-ring" strokeDasharray="3 7" />
      {nodes.map((n) => (
        <path key={n.label} d={`M200 200L${n.x} ${n.y}`} stroke="url(#a3-s)" strokeWidth="2.5" strokeDasharray="3 9" strokeLinecap="round" className="il-flow" />
      ))}
      <circle cx="200" cy="200" r="48" fill="url(#a3-g)" />
      <path d="M180 224v-48l40 48v-48" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      {nodes.map((n) => (
        <g key={n.label} transform={`translate(${n.x - 34} ${n.y - 34})`}>
          <rect width="68" height="68" rx="20" className="il-card" />
          {n.label === "chat" ? (
            <>
              <path d="M18 24h32a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H34l-10 8v-8h-6a6 6 0 0 1-6-6V30a6 6 0 0 1 6-6z" fill="url(#a3-g)" />
            </>
          ) : null}
          {n.label === "table" ? (
            <>
              <rect x="16" y="20" width="36" height="28" rx="6" className="il-soft" />
              <path d="M16 31h36M30 20v28" className="il-line" strokeWidth="2" />
              <rect x="32" y="33" width="18" height="13" rx="3" fill="url(#a3-g)" />
            </>
          ) : null}
          {n.label === "mail" ? (
            <>
              <rect x="14" y="22" width="40" height="26" rx="7" className="il-soft" />
              <path d="M16 26l18 14 18-14" stroke="#7c5cff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : null}
          {n.label === "calendar" ? (
            <>
              <rect x="15" y="20" width="38" height="32" rx="8" className="il-soft" />
              <rect x="15" y="20" width="38" height="11" rx="6" fill="url(#a3-g)" />
              <path d="M26 41l5 5 9-10" stroke="#7c5cff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

/** 04: a system made to measure: an app window with panels, a chart and a cursor. */
export function BuildArt() {
  return (
    <svg {...base} aria-label="Tela de um sistema sob medida" className="il">
      <Defs id="a4" />
      <circle cx="200" cy="200" r="168" className="il-ring" />
      <rect x="52" y="86" width="296" height="228" rx="22" className="il-card" />
      <path d="M52 124h296" className="il-line" strokeWidth="1.5" />
      <circle cx="76" cy="105" r="5" fill="#f87171" />
      <circle cx="94" cy="105" r="5" fill="#fbbf24" />
      <circle cx="112" cy="105" r="5" fill="#34d399" />
      <rect x="68" y="140" width="64" height="158" rx="12" className="il-soft" />
      {[154, 180, 206, 232].map((y, i) => (
        <rect key={y} x="78" y={y} width={i === 0 ? 44 : 36} height="8" rx="4" fill={i === 0 ? "url(#a4-g)" : undefined} className={i === 0 ? undefined : "il-line"} />
      ))}
      <rect x="146" y="140" width="92" height="58" rx="12" className="il-soft" />
      <rect x="158" y="154" width="40" height="7" rx="3.5" className="il-line" />
      <rect x="158" y="170" width="56" height="14" rx="5" fill="url(#a4-g)" />
      <rect x="250" y="140" width="82" height="58" rx="12" className="il-soft" />
      <path d="M262 184l16-14 14 8 22-24" stroke="url(#a4-s)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="146" y="212" width="186" height="86" rx="12" className="il-soft" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={162 + i * 28} y={274 - [30, 52, 38, 62, 46, 68][i]} width="16" height={[30, 52, 38, 62, 46, 68][i]} rx="5" fill={i === 5 ? "url(#a4-g)" : undefined} className={i === 5 ? undefined : "il-bar"} />
      ))}
      <path d="M300 250l10 30 6-12 12-4z" fill="url(#a4-g)" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <path d="M338 72l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="url(#a4-s)" />
    </svg>
  );
}

/** About: a constellation of connected points around the Nexo mark. */
export function ConstellationArt() {
  const pts: [number, number, number][] = [
    [70, 120, 6], [130, 60, 4], [250, 40, 5], [336, 96, 7], [362, 220, 4], [316, 330, 6], [196, 366, 4], [92, 316, 7], [38, 214, 4],
  ];
  return (
    <svg {...base} aria-label="Pontos conectados em volta da marca Nexo" className="il il-wide">
      <Defs id="a5" />
      <circle cx="200" cy="200" r="170" stroke="#fff" strokeOpacity="0.12" />
      <circle cx="200" cy="200" r="120" stroke="#fff" strokeOpacity="0.12" strokeDasharray="3 8" />
      <circle cx="200" cy="200" r="74" stroke="#fff" strokeOpacity="0.18" />
      {pts.map(([x, y], i) => (
        <path key={i} d={`M200 200L${x} ${y}`} stroke="url(#a5-s)" strokeOpacity="0.55" strokeWidth="1.5" />
      ))}
      {pts.map(([x, y], i) => (
        <path key={`n${i}`} d={`M${x} ${y}L${pts[(i + 1) % pts.length][0]} ${pts[(i + 1) % pts.length][1]}`} stroke="#fff" strokeOpacity="0.16" strokeWidth="1" />
      ))}
      {pts.map(([x, y, r], i) => (
        <g key={`c${i}`}>
          <circle cx={x} cy={y} r={r + 7} fill="#7c5cff" opacity="0.18" />
          <circle cx={x} cy={y} r={r} fill={i % 3 === 0 ? "url(#a5-s)" : "#fff"} />
        </g>
      ))}
      <circle cx="200" cy="200" r="52" fill="url(#a5-g)" />
      <path d="M182 222v-44l36 44v-44" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const serviceArts = [ChatArt, FlowArt, ConnectArt, BuildArt];
