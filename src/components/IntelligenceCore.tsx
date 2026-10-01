import { Brand } from "@/components/Brand";

/** CSS 3D geometry: six cube faces and three orbital planes, no WebGL dependency. */
export function IntelligenceCore() {
  return (
    <div className="core-stage" aria-hidden="true">
      <div className="core-floor" />
      <div className="core-space">
        <div className="core-orbit orbit-one">
          <i />
        </div>
        <div className="core-orbit orbit-two">
          <i />
        </div>
        <div className="core-orbit orbit-three">
          <i />
        </div>
        <div className="core-cube">
          {["front", "back", "right", "left", "top", "bottom"].map((face) => (
            <div key={face} className={`cube-face cube-${face}`}>
              <Brand compact />
            </div>
          ))}
        </div>
        <div className="core-satellite satellite-one" />
        <div className="core-satellite satellite-two" />
      </div>
      <span className="core-caption">
        DADOS CONECTADOS. INTELIGÊNCIA EM MOVIMENTO.
      </span>
    </div>
  );
}
