import { useRef, useState } from "react";
import "../../styles/Analysis.css";

const features = [
  "Monitoramento",
  "Análise de dados",
  "Identificação de problemas e gargalos",
  "Relatórios semanais",
  "Priorização de problemas",
  "Estratégias para solucionar problemas",
  "Plano de ação",
];

const plans = [
  {
    name: "Diagnóstico",
    price: "R$ 800",
    description:
      "Para empresas que precisam entender melhor sua operação, identificar problemas e descobrir onde concentrar sua atenção.",
    features: [true, true, true, true, false, false, false],
  },
  {
    name: "Estratégia",
    price: "R$ 1.050",
    description:
      "Para empresas que querem entender os problemas, definir prioridades e transformar os dados em ações práticas.",
    features: [true, true, true, true, true, true, true],
  },
];

function Analysis() {
  const [activePlan, setActivePlan] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    moved: false,
    horizontal: false,
  });

  const scrollToPlan = (index: number) => {
    if (!trackRef.current) return;

    trackRef.current.scrollTo({
      left: index * trackRef.current.clientWidth,
      behavior: "smooth",
    });

    setActivePlan(index);
  };

  const handlePlanScroll = () => {
    if (!trackRef.current) return;

    const width = trackRef.current.clientWidth;

    if (!width) return;

    const index = Math.round(
      trackRef.current.scrollLeft / width
    );

    setActivePlan(
      Math.max(0, Math.min(index, plans.length - 1))
    );
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!trackRef.current || event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: trackRef.current.scrollLeft,
      moved: false,
      horizontal: false,
    };

    trackRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const track = trackRef.current;
    const drag = dragRef.current;

    if (!track || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (!drag.horizontal && Math.abs(deltaX) > 6) {
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
      drag.horizontal = true;
      setIsDragging(true);
    }

    if (!drag.horizontal) return;

    event.preventDefault();
    drag.moved = true;
    track.scrollLeft = drag.scrollLeft - deltaX;
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;

    if (!track || dragRef.current.pointerId !== event.pointerId) return;

    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }

    dragRef.current.pointerId = -1;
    dragRef.current.horizontal = false;
    setIsDragging(false);
  };

  const preventClickAfterDrag = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!dragRef.current.moved) return;

    event.preventDefault();
    event.stopPropagation();
    dragRef.current.moved = false;
  };

  return (
    <section className="analysis" id="analise">

      {/* HEADER */}

      <div
        className="analysis__header"
        data-scroll-reveal
      >
        <p className="analysis__eyebrow">
          ANÁLISE EMPRESARIAL
        </p>

        <h2 className="analysis__title">
          Entenda o que está acontecendo.
          <span> Saiba como agir.</span>
        </h2>

        <p className="analysis__description">
          A Nexo acompanha continuamente o seu negócio,
          transformando dados em informações que ajudam
          você a tomar decisões melhores.
        </p>
      </div>

      {/* COMO FUNCIONA */}

      <div
        className="analysis__intro"
        data-scroll-reveal
      >
        <div className="analysis__intro-content">
          <span className="analysis__intro-label">
            COMO FUNCIONA
          </span>

          <h3>
            Mais do que relatórios.
            <span> Direcionamento para o negócio.</span>
          </h3>

          <p>
            A análise da Nexo não se limita a apresentar
            números. Acompanhamos o negócio, identificamos
            comportamentos fora do esperado e encontramos
            problemas e oportunidades que podem passar
            despercebidos no dia a dia.
          </p>
        </div>

        <div className="analysis__intro-points">
          <div>
            <span>01</span>

            <p>
              <strong>Entender</strong>
              <br />
              O que está acontecendo no negócio.
            </p>
          </div>

          <div>
            <span>02</span>

            <p>
              <strong>Identificar</strong>
              <br />
              Problemas, gargalos e oportunidades.
            </p>
          </div>

          <div>
            <span>03</span>

            <p>
              <strong>Agir</strong>
              <br />
              Definir prioridades e próximos passos.
            </p>
          </div>
        </div>
      </div>

      {/* PLANOS */}

      <div
        className="analysis__plans-intro"
        data-scroll-reveal
      >
        <span>PLANOS DE ANÁLISE</span>

        <p>
          Escolha o nível de acompanhamento que melhor
          corresponde às necessidades da sua empresa.
        </p>
      </div>

      {/* DESKTOP */}

      <div
        className="comparison comparison--desktop"
        data-scroll-reveal
      >
        <div className="comparison__head">
          <div className="comparison__head-title">
            O que está incluso
          </div>

          {plans.map((plan, index) => (
            <div
              className={`comparison__plan ${
                index === 1
                  ? "comparison__plan--featured"
                  : ""
              }`}
              key={plan.name}
            >
              {index === 1 && (
                <small className="comparison__recommended">
                  RECOMENDADO
                </small>
              )}

              <span>{plan.name}</span>

              <strong>{plan.price}</strong>

              <small>/mês</small>

              <p className="comparison__plan-description">
                {plan.description}
              </p>
            </div>
          ))}
        </div>

        <div className="comparison__body">
          {features.map((feature, featureIndex) => (
            <div
              className="comparison__row"
              key={feature}
            >
              <div className="comparison__feature">
                {feature}
              </div>

              {plans.map((plan, planIndex) => (
                <div
                  className={`comparison__value ${
                    planIndex === 1
                      ? "comparison__value--featured"
                      : ""
                  }`}
                  key={plan.name}
                >
                  <span
                    className={`comparison__check ${
                      plan.features[featureIndex]
                        ? "comparison__check--active"
                        : ""
                    }`}
                  >
                    {plan.features[featureIndex]
                      ? "✓"
                      : "✕"}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="comparison__footer">
          <div />

          {plans.map((plan, index) => (
            <a
              key={plan.name}
              href="#contato"
              className={`comparison__button ${
                index === 1
                  ? "comparison__button--featured"
                  : ""
              }`}
            >
              Quero o {plan.name}
            </a>
          ))}
        </div>
      </div>

      {/* MOBILE */}

      <div
        className="plans-mobile"
        data-scroll-reveal
      >
        <div
          ref={trackRef}
          className={`plans-mobile__track ${isDragging ? "is-dragging" : ""}`}
          onScroll={handlePlanScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onClickCapture={preventClickAfterDrag}
        >
          {plans.map((plan, planIndex) => (
            <article
              className="plans-mobile__card"
              key={plan.name}
            >
              {planIndex === 1 && (
                <span className="plans-mobile__recommended">
                  RECOMENDADO
                </span>
              )}

              <span className="plans-mobile__label">
                {plan.name}
              </span>

              <div className="plans-mobile__price">
                <strong>{plan.price}</strong>
                <small>/mês</small>
              </div>

              <p className="plans-mobile__description">
                {plan.description}
              </p>

              <div className="plans-mobile__features">
                {features.map((feature, featureIndex) => (
                  <div
                    className="plans-mobile__feature"
                    key={feature}
                  >
                    <span
                      className={
                        plan.features[featureIndex]
                          ? "active"
                          : ""
                      }
                    >
                      {plan.features[featureIndex]
                        ? "✓"
                        : "✕"}
                    </span>

                    <p>{feature}</p>
                  </div>
                ))}
              </div>

              <a
                href="#contato"
                className="plans-mobile__button"
              >
                Quero o {plan.name}
              </a>
            </article>
          ))}
        </div>

        <div className="plans-mobile__navigation">
          <button
            type="button"
            onClick={() => scrollToPlan(0)}
            className={
              activePlan === 0
                ? "active"
                : ""
            }
            aria-label="Plano Diagnóstico"
          />

          <button
            type="button"
            onClick={() => scrollToPlan(1)}
            className={
              activePlan === 1
                ? "active"
                : ""
            }
            aria-label="Plano Estratégia"
          />
        </div>

        <span className="plans-mobile__counter">
          {activePlan + 1} / {plans.length}
        </span>
      </div>

      {/* O QUE VOCÊ RECEBE */}

      <div
        className="analysis__value"
        data-scroll-reveal
      >
        <div>
          <span className="analysis__value-label">
            O QUE VOCÊ RECEBE
          </span>

          <h3>
            Informação que
            <span> ajuda a decidir.</span>
          </h3>
        </div>

        <div className="analysis__value-list">
          <div>
            <span>01</span>

            <p>
              <strong>Visão do negócio</strong>
              <br />
              Acompanhamento dos principais indicadores.
            </p>
          </div>

          <div>
            <span>02</span>

            <p>
              <strong>Identificação de problemas</strong>
              <br />
              Descoberta de gargalos e comportamentos fora
              do esperado.
            </p>
          </div>

          <div>
            <span>03</span>

            <p>
              <strong>Priorização</strong>
              <br />
              Definição do que merece atenção primeiro.
            </p>
          </div>

          <div>
            <span>04</span>

            <p>
              <strong>Direcionamento</strong>
              <br />
              Estratégias e próximos passos para agir.
            </p>
          </div>
        </div>
      </div>

      {/* OBSERVAÇÃO */}

      <div
        className="analysis__note"
        data-scroll-reveal
      >
        <span>+</span>

        <p>
          Os planos de análise são independentes do serviço
          de desenvolvimento. Se sua empresa precisar de
          um site ou automação, a Nexo também pode desenvolver
          a solução sob medida.
        </p>
      </div>
    </section>
  );
}

export default Analysis;
