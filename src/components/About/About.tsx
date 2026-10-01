import "../../styles/About.css";

function About() {
  return (
    <div className="about">
      <div className="about__header" data-scroll-reveal>
        <p className="about__eyebrow">SOBRE A NEXO</p>

        <h2 className="about__title">
          Não vendemos IA isolada.
          <span> Transformamos operações.</span>
        </h2>

        <p className="about__description">
          A Nexo analisa empresas para encontrar processos caros, lentos ou dependentes de trabalho manual e integra Inteligência Artificial para torná-los mais eficientes.
        </p>
      </div>

      <div className="about__content" data-scroll-reveal>
        <div className="about__text">
          <p>
            Entramos no negócio para entender processos, tarefas, sistemas e equipes. Buscamos onde existe trabalho repetitivo ou operacional que pode ser reduzido com tecnologia.
          </p>

          <p>
            Depois, unimos Inteligência Artificial, software, dados e integrações para construir sistemas capazes de assumir tarefas, acelerar fluxos e permitir que a empresa opere com mais capacidade.
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
