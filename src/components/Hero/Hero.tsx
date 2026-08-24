import HeroScene from "../../components3d/HeroScene/HeroScene";

function Hero() {
  return (
    <section className="hero">
      <div className="hero__content">
        <p
          className="hero__eyebrow"
          data-hero-reveal
        >
          NEXO — ANÁLISE, ESTRATÉGIA E DESENVOLVIMENTO
        </p>

        <h1
          className="hero__title"
          data-hero-reveal
        >
          Entenda o seu negócio.
          <br />
          <span>Transforme-o.</span>
        </h1>

        <p
          className="hero__description"
          data-hero-reveal
        >
          Analisamos seu negócio para identificar problemas e
          oportunidades e desenvolvemos sites e automações
          para transformar essas necessidades em soluções.
        </p>

        <div
          className="hero__actions"
          data-hero-reveal
        >
          <a
            className="hero__button hero__button--primary"
            href="#analise"
          >
            Análise Empresarial
          </a>

          <a
            className="hero__button hero__button--secondary"
            href="#desenvolvimento"
          >
            Desenvolvimento
          </a>
        </div>
      </div>

      <div
        className="hero__visual"
        data-hero-visual
      >
        <HeroScene />
      </div>
    </section>
  );
}

export default Hero;