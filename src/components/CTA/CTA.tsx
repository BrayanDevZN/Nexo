import "../../styles/CTA.css";

function CTA() {
  const whatsappNumber = "553196447823";
  const message = encodeURIComponent(
    "Olá! Conheci a Nexo pelo site e quero avaliar como aplicar Inteligência Artificial na minha empresa."
  );
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${message}`;

  return (
    <div className="cta">
      <div className="cta__content">
        <p className="cta__eyebrow">ANALISE SUA OPERAÇÃO</p>

        <h2 className="cta__title">
          Quanto trabalho da sua empresa
          <span> poderia ser automatizado?</span>
        </h2>

        <p className="cta__description">
          Conte como sua empresa funciona. Analisamos processos, gargalos e tarefas que consomem sua equipe para identificar onde a IA pode reduzir trabalho manual, custos e tempo de execução.
        </p>

        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="cta__button">
          Falar com a Nexo <span>↗</span>
        </a>
      </div>

      <div className="cta__bottom">
        <span>NEXO</span>
        <p>Análise de Negócio, Automação e Inteligência Artificial</p>
      </div>
    </div>
  );
}

export default CTA;
