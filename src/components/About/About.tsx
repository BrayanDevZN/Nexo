import "../../styles/About.css";

function About() {
  return (
    <div className="about">
      <div className="about__header" data-scroll-reveal>
        <p className="about__eyebrow">SOBRE A NEXO</p>

        <h2 className="about__title">
          IA não é o produto.
          <span> Resultado é.</span>
        </h2>

        <p className="about__description">
          A Nexo é uma agência de Inteligência Artificial que transforma
          problemas operacionais em sistemas, agentes e automações aplicados ao negócio.
        </p>
      </div>

      <div className="about__content" data-scroll-reveal>
        <div className="about__text">
          <p>
            Nosso trabalho começa entendendo onde a empresa perde tempo,
            capacidade ou dinheiro. Só depois definimos como a IA pode participar
            daquele processo.
          </p>

          <p>
            Unimos Inteligência Artificial, software, dados e integrações para
            construir soluções que saem da demonstração e entram na operação.
          </p>
        </div>

        <div className="about__principles">
          <article className="about__principle">
            <span>01</span>
            <div>
              <h3>Problema antes da tecnologia</h3>
              <p>Não colocamos IA onde ela não precisa existir. Primeiro buscamos impacto real.</p>
            </div>
          </article>

          <article className="about__principle">
            <span>02</span>
            <div>
              <h3>Integração com a operação</h3>
              <p>A solução precisa conversar com dados, sistemas, ferramentas e pessoas da empresa.</p>
            </div>
          </article>

          <article className="about__principle">
            <span>03</span>
            <div>
              <h3>Construção sob medida</h3>
              <p>Cada processo tem regras e contexto próprios. A arquitetura acompanha essa realidade.</p>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

export default About;
