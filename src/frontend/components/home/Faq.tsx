import { faqs } from "@/lib/content";

export function Faq() {
  return (
    <section
      id="duvidas"
      className="nx-section nx-wrap nx-faq"
      aria-labelledby="faq-title"
    >
      <div className="nx-faq-row">
        <h2 id="faq-title" className="nx-faq-q nx-faq-title nx-reveal">
          Vamos tirar as dúvidas.
        </h2>
        <p className="nx-faq-a nx-soft nx-reveal">
          Cada operação tem seu contexto. A conversa começa por ele.
        </p>
      </div>
      {faqs.map((faq) => (
        <div className="nx-faq-row nx-reveal" key={faq.question}>
          <h3 className="nx-faq-q">{faq.question}</h3>
          <p className="nx-faq-a">{faq.answer}</p>
        </div>
      ))}
    </section>
  );
}
