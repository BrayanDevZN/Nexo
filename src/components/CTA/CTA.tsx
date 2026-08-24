import "../../styles/CTA.css";

function CTA() {
  const whatsappNumber = "553196447823";

  const message = encodeURIComponent(
    "Olá! Conheci a Nexo pelo site e gostaria de saber como vocês podem ajudar minha empresa."
  );

  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${message}`;

  return (
    <section className="cta" id="contato">
      <div className="cta__content">
        <p className="cta__eyebrow">
          VAMOS CONVERSAR
        </p>

        <h2 className="cta__title">
          Seu próximo passo
          <span> começa aqui.</span>
        </h2>

        <p className="cta__description">
          Conte o que sua empresa precisa. A Nexo entende
          o cenário e avalia como pode ajudar.
        </p>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cta__button"
        >
          Falar com a Nexo
          <span>↗</span>
        </a>
      </div>

      <div className="cta__bottom">
        <span>NEXO</span>

        <p>
          Análise, Estratégia e Desenvolvimento
        </p>
      </div>
    </section>
  );
}

export default CTA;