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
        <p className="cta__eyebrow">VAMOS ENCONTRAR UMA OPORTUNIDADE</p>

        <h2 className="cta__title">
          Onde a IA pode gerar
          <span> impacto na sua empresa?</span>
        </h2>

        <p className="cta__description">
          Conte como sua operação funciona, onde existe trabalho manual ou
          gargalos. A Nexo avalia o cenário e identifica possibilidades reais de automação com IA.
        </p>

        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="cta__button">
          Falar com a Nexo <span>↗</span>
        </a>
      </div>

      <div className="cta__bottom">
        <span>NEXO</span>
        <p>Agência de Inteligência Artificial</p>
      </div>
    </div>
  );
}

export default CTA;
