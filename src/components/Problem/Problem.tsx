import "../../styles/Problem.css";

function Problem() {
  return (
    <div className="problem">
      <div
        className="problem__header"
        data-scroll-reveal
      >
        <p className="problem__eyebrow">
          O PROBLEMA
        </p>

        <h2 className="problem__title">
          Você sabe o que está acontecendo
          <span> no seu negócio?</span>
        </h2>

        <p className="problem__description">
          Nem todo problema aparece de forma evidente.
          Quedas nas vendas, perda de clientes e processos
          ineficientes deixam sinais nos dados antes de
          aparecerem no resultado final.
        </p>
      </div>

      <div className="problem__grid">
        <article
          className="problem__card"
          data-scroll-reveal
        >
          <span className="problem__number">
            01
          </span>

          <h3>
            Decisões sem informação
          </h3>

          <p>
            Decidir apenas com base em percepção pode fazer
            você ignorar problemas que já estão acontecendo.
          </p>
        </article>

        <article
          className="problem__card"
          data-scroll-reveal
        >
          <span className="problem__number">
            02
          </span>

          <h3>
            Processos ineficientes
          </h3>

          <p>
            Tarefas manuais e processos mal estruturados
            consomem tempo e dificultam o crescimento.
          </p>
        </article>

        <article
          className="problem__card"
          data-scroll-reveal
        >
          <span className="problem__number">
            03
          </span>

          <h3>
            Problemas que passam despercebidos
          </h3>

          <p>
            Pequenas mudanças podem indicar problemas maiores.
            Sem acompanhamento, elas podem passar despercebidas.
          </p>
        </article>
      </div>
    </div>
  );
}

export default Problem;
