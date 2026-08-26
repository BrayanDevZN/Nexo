import "../../styles/About.css";

function About() {
  return (
    <section className="about" id="sobre">
      <div className="about__header" data-scroll-reveal>
        <p className="about__eyebrow">
          SOBRE A NEXO
        </p>

        <h2 className="about__title">
          Não começamos pela solução.
          <span> Começamos pelo problema.</span>
        </h2>

        <p className="about__description">
          A Nexo existe para ajudar empresas a entender melhor
          o próprio negócio e transformar necessidades em
          soluções práticas.
        </p>
      </div>

      <div className="about__content" data-scroll-reveal>
        <div className="about__text">
          <p>
            Antes de desenvolver ou recomendar qualquer solução,
            buscamos entender o cenário, os processos e os
            objetivos de cada negócio.
          </p>

          <p>
            Identificamos problemas, gargalos e oportunidades
            e, a partir disso, definimos o que realmente precisa
            ser feito.
          </p>
        </div>

        <div className="about__principles">
          <article className="about__principle">
            <span>01</span>

            <div>
              <h3>Entender antes de agir</h3>

              <p>
                Decisões melhores começam com uma visão clara
                do que está acontecendo.
              </p>
            </div>
          </article>

          <article className="about__principle">
            <span>02</span>

            <div>
              <h3>Estratégia e tecnologia</h3>

              <p>
                Tecnologia só faz sentido quando resolve uma
                necessidade real do negócio.
              </p>
            </div>
          </article>

          <article className="about__principle">
            <span>03</span>

            <div>
              <h3>Soluções sob medida</h3>

              <p>
                Cada empresa possui processos e objetivos
                diferentes. A solução também deve ser.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export default About;
