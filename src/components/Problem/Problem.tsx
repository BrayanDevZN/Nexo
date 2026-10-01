import "../../styles/Problem.css";

function Problem() {
  return (
    <div className="problem">
      <div className="problem__header" data-scroll-reveal>
        <p className="problem__eyebrow">POR QUE IA?</p>

        <h2 className="problem__title">
          Sua equipe ainda perde tempo
          <span> com trabalho que poderia ser automatizado?</span>
        </h2>

        <p className="problem__description">
          Processos manuais, informações espalhadas e tarefas repetitivas
          consomem capacidade da equipe. A IA pode assumir parte desse trabalho
          quando é integrada ao processo certo.
        </p>
      </div>

      <div className="problem__grid">
        <article className="problem__card" data-scroll-reveal>
          <span className="problem__number">01</span>
          <h3>Trabalho repetitivo</h3>
          <p>
            Pessoas gastam horas copiando dados, classificando informações,
            respondendo demandas e executando rotinas previsíveis.
          </p>
        </article>

        <article className="problem__card" data-scroll-reveal>
          <span className="problem__number">02</span>
          <h3>Processos desconectados</h3>
          <p>
            Sistemas que não conversam entre si criam retrabalho, atrasos e
            dependência de tarefas manuais para manter a operação funcionando.
          </p>
        </article>

        <article className="problem__card" data-scroll-reveal>
          <span className="problem__number">03</span>
          <h3>IA sem aplicação prática</h3>
          <p>
            Usar IA isoladamente não transforma uma empresa. O valor aparece
            quando ela recebe contexto, acessa ferramentas e participa do fluxo real.
          </p>
        </article>
      </div>
    </div>
  );
}

export default Problem;
