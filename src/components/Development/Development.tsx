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
        className="development__services"
        data-development-services
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