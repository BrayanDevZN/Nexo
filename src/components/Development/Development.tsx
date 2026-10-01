import { useRef, useState } from "react";
import "../../styles/Development.css";

const services = [
  {
    number: "01",
    title: "Agentes de IA",
    description:
      "Criamos agentes capazes de entender contexto, consultar informações, usar ferramentas e executar etapas de processos da sua empresa.",
    items: ["Atendimento inteligente", "Agentes internos", "RAG e bases de conhecimento", "Uso de ferramentas e APIs", "Fluxos multiagente"],
  },
  {
    number: "02",
    title: "Automação Inteligente",
    description:
      "Combinamos IA, regras de negócio e integrações para automatizar processos que hoje dependem de trabalho manual.",
    items: ["Automação de processos", "Documentos e dados", "E-mail e mensageria", "Integração entre sistemas", "Workflows personalizados"],
  },
  {
    number: "03",
    title: "IA Integrada",
    description:
      "Adicionamos capacidades de Inteligência Artificial aos sistemas e produtos que sua empresa já utiliza.",
    items: ["APIs de IA", "Sistemas internos", "ERPs e CRMs", "Busca inteligente", "Análise e geração de conteúdo"],
  },
  {
    number: "04",
    title: "Soluções sob medida",
    description:
      "Quando o problema não cabe em uma ferramenta pronta, arquitetamos e desenvolvemos uma solução específica para a operação.",
    items: ["Arquitetura da solução", "Backend e APIs", "Bancos e dados", "Infraestrutura", "Monitoramento e evolução"],
  },
];

function Development() {
  const [activeService, setActiveService] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ pointerId: -1, startX: 0, startY: 0, scrollLeft: 0, moved: false, horizontal: false });

  const scrollToService = (index: number) => {
    if (!trackRef.current) return;
    trackRef.current.scrollTo({ left: index * trackRef.current.clientWidth, behavior: "smooth" });
    setActiveService(index);
  };

  const handleServiceScroll = () => {
    if (!trackRef.current?.clientWidth) return;
    const index = Math.round(trackRef.current.scrollLeft / trackRef.current.clientWidth);
    setActiveService(Math.max(0, Math.min(index, services.length - 1)));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current || event.pointerType !== "mouse" || event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, scrollLeft: trackRef.current.scrollLeft, moved: false, horizontal: false };
    trackRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
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
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    dragRef.current.pointerId = -1;
    dragRef.current.horizontal = false;
    setIsDragging(false);
  };

  return (
    <div className="development">
      <div className="development__header" data-scroll-reveal>
        <p className="development__eyebrow">SOLUÇÕES DE IA</p>
        <h2 className="development__title">
          Inteligência Artificial
          <span> aplicada ao seu negócio.</span>
        </h2>
        <p className="development__description">
          Projetamos sistemas que usam IA para executar tarefas, acessar
          conhecimento, conectar ferramentas e tornar processos mais rápidos e escaláveis.
        </p>
      </div>

      <div className="development__carousel">
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
            <article className="development__card" key={service.number} data-development-card>
              <div className="development__card-top">
                <span className="development__number">{service.number}</span>
                <a href="#contato" className="development__arrow" aria-label={`Falar com a Nexo sobre ${service.title}`}>↗</a>
              </div>
              <h3 className="development__card-title">{service.title}</h3>
              <p className="development__card-description">{service.description}</p>
              <ul className="development__list">
                {service.items.map((item) => <li key={item}><span>+</span>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>

        <button
          type="button"
          className={`development__side-arrow ${activeService === services.length - 1 ? "development__side-arrow--left" : "development__side-arrow--right"}`}
          onClick={() => scrollToService(activeService === services.length - 1 ? activeService - 1 : activeService + 1)}
          aria-label={activeService === services.length - 1 ? "Voltar para o serviço anterior" : "Avançar para o próximo serviço"}
        >
          <span aria-hidden="true">{activeService === services.length - 1 ? "←" : "→"}</span>
        </button>
      </div>

      <div className="development__carousel-navigation">
        <div className="development__carousel-dots">
          {services.map((service, index) => (
            <button key={service.title} type="button" className={activeService === index ? "active" : ""} onClick={() => scrollToService(index)} aria-label={`Ver serviço ${service.title}`} />
          ))}
        </div>
        <span className="development__carousel-counter">{activeService + 1} / {services.length}</span>
      </div>

      <div className="development__bottom" data-scroll-reveal>
        <div className="development__custom">
          <span className="development__custom-label">PROJETO SOB MEDIDA</span>
          <h3>
            Você traz o problema.
            <span> A gente arquiteta a solução.</span>
          </h3>
          <p>
            Não precisa saber qual modelo, framework ou ferramenta usar.
            Entendemos o processo, avaliamos a viabilidade e desenhamos a
            arquitetura adequada para colocar IA onde ela realmente gera valor.
          </p>
          <p>
            Cada projeto é orçado de acordo com escopo, complexidade,
            integrações, infraestrutura e nível de acompanhamento necessário.
          </p>
        </div>

        <a href="#contato" className="development__button">
          Avaliar meu processo <span>↗</span>
        </a>
      </div>

      <div className="development__maintenance" data-scroll-reveal>
        <div>
          <span>EVOLUÇÃO CONTÍNUA</span>
          <h4>IA em produção precisa ser acompanhada.</h4>
        </div>
        <p>
          Após a entrega, podemos acompanhar a solução, corrigir falhas,
          melhorar prompts e fluxos, ajustar integrações e evoluir o sistema
          conforme a operação e os dados reais.
        </p>
      </div>
    </div>
  );
}

export default Development;
