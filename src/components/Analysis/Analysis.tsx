import "../../styles/Analysis.css";

const opportunities = [
  {
    number: "01",
    title: "Analisamos o negócio",
    text: "Mapeamos processos, equipes, gargalos, custos operacionais e tarefas que consomem tempo no dia a dia.",
  },
  {
    number: "02",
    title: "Encontramos oportunidades",
    text: "Identificamos tarefas e fluxos em que IA e automação podem reduzir trabalho manual e ampliar a capacidade da equipe.",
  },
  {
    number: "03",
    title: "Integramos a IA",
    text: "Construímos a solução e conectamos IA aos dados, sistemas e ferramentas que já fazem parte da operação.",
  },
];

function Analysis() {
  return (
    <div className="analysis">
      <div className="analysis__header" data-scroll-reveal>
        <p className="analysis__eyebrow">NOSSO PROCESSO</p>

        <h2 className="analysis__title">
          Primeiro entendemos o negócio.
          <span> Depois automatizamos.</span>
        </h2>

        <p className="analysis__description">
          Nosso trabalho começa dentro do processo. Entendemos o que cada equipe faz,
          onde existe retrabalho e quais tarefas consomem capacidade. Só então desenhamos
          como a IA pode assumir ou acelerar parte dessa operação.
        </p>
      </div>

      <div className="analysis__intro" data-scroll-reveal>
        <div className="analysis__intro-content">
          <span className="analysis__intro-label">DA IDEIA À OPERAÇÃO</span>

          <h3>
            Da análise da operação
            <span> à automação com IA.</span>
          </h3>

          <p>
            A meta não é simplesmente colocar IA na empresa. É redesenhar processos
            para que tarefas que antes exigiam horas de trabalho de uma ou várias equipes
            possam ser executadas ou aceleradas por sistemas inteligentes.
          </p>
        </div>

        <div className="analysis__intro-points">
          {opportunities.map((item) => (
            <div key={item.number}>
              <span>{item.number}</span>
              <p>
                <strong>{item.title}</strong>
                <br />
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="analysis__value" data-scroll-reveal>
        <div>
          <span className="analysis__value-label">ONDE A IA ENTRA</span>
          <h3>
            Menos operação manual.
            <span> Mais eficiência para crescer.</span>
          </h3>
        </div>

        <div className="analysis__value-list">
          <div><span>01</span><p><strong>Atendimento e operação</strong><br />Agentes capazes de consultar contexto, executar ações e encaminhar exceções.</p></div>
          <div><span>02</span><p><strong>Dados e documentos</strong><br />Extração, classificação, análise e geração de informações a partir de dados da empresa.</p></div>
          <div><span>03</span><p><strong>Processos internos</strong><br />Automação de rotinas entre sistemas, equipes, APIs e ferramentas já utilizadas.</p></div>
          <div><span>04</span><p><strong>Decisão e produtividade</strong><br />Soluções que organizam contexto e ajudam equipes a agir com mais velocidade.</p></div>
        </div>
      </div>

      <div className="analysis__note" data-scroll-reveal>
        <span>+</span>
        <p>
          Não prometemos substituir uma equipe inteira com um botão. Medimos onde existe trabalho automatizável e construímos soluções para reduzir carga operacional, tempo de execução e necessidade de escalar processos apenas adicionando pessoas.
        </p>
      </div>
    </div>
  );
}

export default Analysis;
