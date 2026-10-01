import "../../styles/Problem.css";

function Problem() {
  return (
    <div className="problem">
      <div className="problem__header" data-scroll-reveal>
        <p className="problem__eyebrow">EFICIÊNCIA OPERACIONAL</p>

        <h2 className="problem__title">
          Quantas pessoas são necessárias
          <span> para manter seus processos funcionando?</span>
        </h2>

        <p className="problem__description">
          Muitas empresas mantêm equipes inteiras executando tarefas repetitivas,
          conferindo informações, movendo dados entre sistemas e respondendo às
          mesmas demandas. Nós analisamos esses fluxos para descobrir o que pode ser automatizado com IA.
        </p>
      </div>

      <div className="problem__grid">
        <article className="problem__card" data-scroll-reveal>
          <span className="problem__number">01</span>
          <h3>Horas de trabalho operacional</h3>
          <p>
            Processos que exigem várias pessoas podem concentrar grande parte do tempo da equipe em execução manual, não em atividades de maior valor.
          </p>
        </article>

        <article className="problem__card" data-scroll-reveal>
          <span className="problem__number">02</span>
          <h3>Custo para escalar</h3>
          <p>
            Quando o volume aumenta, contratar mais pessoas não deveria ser a única forma de aumentar a capacidade operacional.
          </p>
        </article>

        <article className="problem__card" data-scroll-reveal>
          <span className="problem__number">03</span>
          <h3>Automação sem análise</h3>
          <p>
            Automatizar a tarefa errada só acelera um processo ruim. Primeiro entendemos a operação; depois decidimos onde a IA realmente faz sentido.
          </p>
        </article>
      </div>
    </div>
  );
}

export default Problem;
