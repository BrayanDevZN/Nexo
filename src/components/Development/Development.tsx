import { useRef, useState } from "react";
import "../../styles/Development.css";

const services = [
  {
    number: "01",
    title: "Sites",
    description:
      "Criamos sites profissionais pensados para apresentar sua empresa, transmitir credibilidade e transformar visitantes em oportunidades.",
    items: [
      "Design personalizado",
      "Experiência responsiva",
      "Funcionalidades sob medida",
      "Integrações",
      "Estrutura preparada para evolução",
    ],
  },
  {
    number: "02",
    title: "Automações",
    description:
      "Automatizamos tarefas repetitivas e conectamos sistemas para reduzir trabalho manual, diminuir erros e tornar sua operação mais eficiente.",
    items: [
      "Automação de processos",
      "Integração entre sistemas",
      "APIs e serviços externos",
      "Regras de negócio",
      "Fluxos personalizados",
    ],
  },
];

function Development() {
  const [activeService, setActiveService] = useState(0);
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

  const scrollToService = (index: number) => {
    if (!trackRef.current) return;

    trackRef.current.scrollTo({
      left: index * trackRef.current.clientWidth,
      behavior: "smooth",
    });
    setActiveService(index);
  };

  const handleServiceScroll = () => {
    if (!trackRef.current?.clientWidth) return;

    const index = Math.round(
      trackRef.current.scrollLeft / trackRef.current.clientWidth
    );
    setActiveService(
      Math.max(0, Math.min(index, services.length - 1))
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

  return (
    <section
      className="development"
      id="desenvolvimento"
    >
      {/* HEADER */}

      <div
        className="development__header"
        data-scroll-reveal
      >
        <p className="development__eyebrow">
          DESENVOLVIMENTO
        </p>

        <h2 className="development__title">
          Transformamos necessidades
          <span> em soluções.</span>
        </h2>

        <p className="development__description">
          Desenvolvemos sites e automações pensados para
          resolver problemas reais, melhorar processos e
          alcançar os objetivos de cada negócio.
        </p>
      </div>

      {/* SERVIÇOS */}

      <div
        ref={trackRef}
        className={`development__services ${isDragging ? "is-dragging" : ""}`}
        data-development-services
        onScroll={handleServiceScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        {services.map((service) => (
          <article
            className="development__card"
            key={service.number}
            data-development-card
          >
            <div className="development__card-top">
              <span className="development__number">
                {service.number}
              </span>

              <span className="development__arrow">
                ↗
              </span>
            </div>

            <h3 className="development__card-title">
              {service.title}
            </h3>

            <p className="development__card-description">
              {service.description}
            </p>

            <ul className="development__list">
              {service.items.map((item) => (
                <li key={item}>
                  <span>+</span>
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="development__carousel-navigation">
        <div className="development__carousel-dots">
          {services.map((service, index) => (
            <button
              key={service.title}
              type="button"
              className={activeService === index ? "active" : ""}
              onClick={() => scrollToService(index)}
              aria-label={`Ver serviço ${service.title}`}
            />
          ))}
        </div>

        <span className="development__carousel-counter">
          {activeService + 1} / {services.length}
        </span>
      </div>

      {/* SOB MEDIDA */}

      <div
        className="development__bottom"
        data-scroll-reveal
      >
        <div className="development__custom">
          <span className="development__custom-label">
            SOB MEDIDA
          </span>

          <h3>
            Não sabe exatamente
            <span> qual solução precisa?</span>
          </h3>

          <p>
            Você não precisa chegar até a Nexo sabendo qual
            tecnologia deve ser utilizada. Conte o que está
            acontecendo no seu negócio e avaliamos a melhor
            solução para sua necessidade.
          </p>

          <p>
            O valor do desenvolvimento é definido
            individualmente, de acordo com a complexidade,
            funcionalidades e integrações necessárias.
          </p>
        </div>

        <a
          href="#contato"
          className="development__button"
        >
          Solicitar orçamento
          <span>↗</span>
        </a>
      </div>

      {/* MANUTENÇÃO */}

      <div
        className="development__maintenance"
        data-scroll-reveal
      >
        <div>
          <span>MANUTENÇÃO</span>

          <h4>
            Continue contando com a Nexo.
          </h4>
        </div>

        <p>
          Após a entrega, a manutenção é opcional e
          corresponde a 10% do valor do desenvolvimento
          por mês. Novas funcionalidades são avaliadas
          e orçadas separadamente.
        </p>
      </div>
    </section>
  );
}

export default Development;
