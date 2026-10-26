import type { ReactNode } from "react";

/** Flat drawings in the brand palette. Each scene has a short looping motion and is described for screen readers. */
const scenes: Record<string, { label: string; draw: () => ReactNode }> = {
  network: {
    label: "Sistemas, pessoas e IA ligados por uma rede de conexões.",
    draw: () => (
      <>
        {[[90, 70], [310, 60], [70, 210], [330, 220], [200, 265], [200, 35]].map(([x, y], i) => (
          <g key={i}>
            <line x1="200" y1="150" x2={x} y2={y} className="art-link" />
            <circle cx={x} cy={y} r="22" className="art-node" />
            <circle cx={x} cy={y} r="7" className="art-dot" style={{ animationDelay: `${i * 0.4}s` }} />
          </g>
        ))}
        <circle cx="200" cy="150" r="46" className="art-hub" />
        <path d="M182 172V128l36 44V128" className="art-n" />
      </>
    ),
  },
  agent: {
    label: "Um agente de IA que usa documentos, e-mail e agenda para atender uma solicitação.",
    draw: () => (
      <>
        <rect x="30" y="40" width="150" height="54" rx="16" className="art-card" />
        <rect x="46" y="58" width="90" height="8" rx="4" className="art-line" />
        <rect x="46" y="74" width="60" height="8" rx="4" className="art-line soft" />
        <rect x="220" y="120" width="150" height="54" rx="16" className="art-card strong" />
        <rect x="236" y="138" width="100" height="8" rx="4" className="art-line on" />
        <rect x="236" y="154" width="70" height="8" rx="4" className="art-line on soft" />
        {[[70, 235], [160, 235], [250, 235]].map(([x, y], i) => (
          <g key={i}>
            <line x1={x + 25} y1={y} x2="200" y2="180" className="art-link" />
            <rect x={x} y={y - 4} width="50" height="44" rx="12" className="art-node" />
            <rect x={x + 14} y={y + 12} width="22" height="4" rx="2" className="art-line" />
            <rect x={x + 14} y={y + 22} width="14" height="4" rx="2" className="art-line soft" />
          </g>
        ))}
        <circle cx="200" cy="150" r="18" className="art-hub" />
        <circle cx="200" cy="150" r="6" className="art-dot on" />
      </>
    ),
  },
  flow: {
    label: "Um fluxo automático que recebe documentos, valida e entrega o resultado pronto.",
    draw: () => (
      <>
        <line x1="60" y1="150" x2="340" y2="150" className="art-link" />
        <circle r="7" className="art-dot travel" cx="60" cy="150" />
        {[60, 200, 340].map((x, i) => (
          <g key={x}>
            <rect x={x - 38} y="112" width="76" height="76" rx="20" className={i === 1 ? "art-hub" : "art-node"} />
            {i === 0 && <><rect x={x - 14} y="130" width="28" height="36" rx="5" className="art-line" /><rect x={x - 8} y="138" width="16" height="4" rx="2" className="art-card" /><rect x={x - 8} y="148" width="10" height="4" rx="2" className="art-card" /></>}
            {i === 1 && <circle cx={x} cy="150" r="14" className="art-ring" />}
            {i === 2 && <path d={`M${x - 14} 150l9 10 19-22`} className="art-check" />}
          </g>
        ))}
        <rect x="60" y="226" width="280" height="10" rx="5" className="art-card" />
        <rect x="60" y="226" width="180" height="10" rx="5" className="art-line on grow" />
      </>
    ),
  },
  systems: {
    label: "Três sistemas da empresa conectados por uma camada de inteligência artificial.",
    draw: () => (
      <>
        {[50, 130, 210].map((y, i) => (
          <g key={y}>
            <rect x="30" y={y} width="140" height="56" rx="16" className="art-card" />
            <rect x="46" y={y + 18} width="70" height="8" rx="4" className="art-line" />
            <rect x="46" y={y + 32} width="44" height="8" rx="4" className="art-line soft" />
            <path d={`M170 ${y + 28}H215Q230 ${y + 28} 230 ${y + 43}V150`} className="art-link" fill="none" />
            <circle cx="170" cy={y + 28} r="5" className="art-dot" style={{ animationDelay: `${i * 0.5}s` }} />
          </g>
        ))}
        <rect x="230" y="105" width="140" height="90" rx="22" className="art-hub" />
        <path d="M278 165V135l24 30V135" className="art-n" />
        <circle cx="344" cy="127" r="5" className="art-dot on" />
      </>
    ),
  },
  custom: {
    label: "Um software montado sob medida, peça por peça.",
    draw: () => (
      <>
        <rect x="60" y="50" width="280" height="200" rx="24" className="art-card" />
        <rect x="60" y="50" width="280" height="40" rx="24" className="art-node" />
        {[84, 100, 116].map((x) => <circle key={x} cx={x} cy="70" r="5" className="art-dot" />)}
        <rect x="84" y="112" width="100" height="60" rx="14" className="art-hub float" />
        <rect x="200" y="112" width="116" height="26" rx="10" className="art-node" />
        <rect x="200" y="146" width="80" height="26" rx="10" className="art-node" />
        <rect x="84" y="188" width="232" height="38" rx="12" className="art-node" />
        <rect x="96" y="203" width="120" height="8" rx="4" className="art-line on grow" />
      </>
    ),
  },
  docs: {
    label: "Notas, extratos e comprovantes soltos sendo organizados em pastas por cliente.",
    draw: () => (
      <>
        {[[40, 40, -8], [110, 70, 6], [60, 130, 4]].map(([x, y, r], i) => (
          <g key={i} transform={`rotate(${r} ${x + 30} ${y + 38})`} className="art-drift" style={{ animationDelay: `${i * 0.6}s` }}>
            <rect x={x} y={y} width="62" height="76" rx="10" className="art-card" />
            <rect x={x + 12} y={y + 16} width="38" height="6" rx="3" className="art-line" />
            <rect x={x + 12} y={y + 30} width="26" height="6" rx="3" className="art-line soft" />
          </g>
        ))}
        <path d="M190 150h50" className="art-link" />
        <path d="M232 140l14 10-14 10" className="art-check thin" />
        {[50, 120, 190].map((y, i) => (
          <g key={y}>
            <path d={`M262 ${y + 8}h34l10 12h54a10 10 0 0 1 10 10v36a10 10 0 0 1-10 10H262a10 10 0 0 1-10-10V${y + 18}a10 10 0 0 1 10-10z`} className={i === 0 ? "art-hub" : "art-node"} />
            <rect x="274" y={y + 38} width="60" height="7" rx="3.5" className={i === 0 ? "art-line on" : "art-line"} />
          </g>
        ))}
      </>
    ),
  },
  talk: {
    label: "Uma conversa inicial curta entre o escritório e a Nexo.",
    draw: () => (
      <>
        <rect x="30" y="50" width="200" height="74" rx="22" className="art-card" />
        <rect x="52" y="72" width="130" height="8" rx="4" className="art-line" />
        <rect x="52" y="90" width="90" height="8" rx="4" className="art-line soft" />
        <rect x="170" y="156" width="200" height="74" rx="22" className="art-hub float" />
        <rect x="192" y="178" width="130" height="8" rx="4" className="art-line on" />
        <rect x="192" y="196" width="80" height="8" rx="4" className="art-line on soft" />
        <circle cx="62" cy="262" r="16" className="art-ring" />
        <path d="M62 252v10l7 5" className="art-check thin" />
      </>
    ),
  },
  plan: {
    label: "Um plano com etapas marcadas, do desenho ao teste.",
    draw: () => (
      <>
        <line x1="70" y1="150" x2="330" y2="150" className="art-link" />
        {[70, 150, 230, 330].map((x, i) => (
          <g key={x}>
            <circle cx={x} cy="150" r="24" className={i < 3 ? "art-hub" : "art-node"} />
            {i < 3 && <path d={`M${x - 9} 150l6 7 12-14`} className="art-check thin on" />}
            <rect x={x - 22} y="196" width="44" height="7" rx="3.5" className="art-line" />
          </g>
        ))}
        <rect x="50" y="86" width="140" height="30" rx="12" className="art-card float" />
      </>
    ),
  },
};

export type ArtName = keyof typeof scenes;

export function Art({ name, className }: { name: ArtName; className?: string }) {
  const scene = scenes[name];
  return (
    <figure className={className ? `nx-art ${className}` : "nx-art"}>
      <svg viewBox="0 0 400 300" role="img" aria-label={scene.label}>
        {scene.draw()}
      </svg>
    </figure>
  );
}
