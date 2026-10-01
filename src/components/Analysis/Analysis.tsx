import "../../styles/Analysis.css";

const opportunities = [
  {
    number: "01",
    title: "Mapeamos",
    text: "Entendemos a operação, os gargalos, tarefas repetitivas e onde a IA pode gerar impacto real.",
  },
  {
    number: "02",
    title: "Arquitetamos",
    text: "Definimos o fluxo, integrações, dados, modelos e regras necessárias para a solução funcionar no negócio.",
  },
  {
    number: "03",
    title: "Implementamos",
    text: "Construímos, integramos e colocamos a solução em produção com foco em confiabilidade e evolução.",
  },
];

function Analysis() {
  return (
    <div className="analysis">
      <div className="analysis__header" data-scroll-reveal>
        <p className="analysis__eyebrow">NOSSO PROCESSO</p>

        <h2 className="analysis__title">
          IA começa pelo problema.
          <span> Não pela ferramenta.</span>
        </h2>

        <p className="analysis__description">
          Antes de automatizar, entendemos como sua empresa funciona. A partir
          disso, identificamos onde agentes e automações podem economizar tempo,
          reduzir custos e aumentar a capacidade da operação.
        </p>
      </div>

      <div className="analysis__intro" data-scroll-reveal>
        <div className="analysis__intro-content">
          <span className="analysis__intro-label">DA IDEIA À OPERAÇÃO</span>

          <h3>
            Tecnologia conectada
            <span> ao processo real.</span>
          </h3>

          <p>
            Não entregamos uma demonstração de IA desconectada do dia a dia.
            Construímos soluções que conversam com sistemas, dados, APIs e
            pessoas para executar trabalho de verdade.
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
            Menos tarefas manuais.
            <span> Mais capacidade.</span>
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
          Cada projeto é desenhado de acordo com o processo e a infraestrutura
          da empresa. A tecnologia é escolhida depois de entendermos o problema.
        </p>
      </div>
    </div>
  );
}

export default Analysis;
