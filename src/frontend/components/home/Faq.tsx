import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
      <Accordion type="single" collapsible className="nx-accordion nx-reveal">
        {faqs.map((faq, index) => (
          <AccordionItem key={faq.question} value={`faq-${index}`}>
            <AccordionTrigger>{faq.question}</AccordionTrigger>
            <AccordionContent>{faq.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
