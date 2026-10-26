import { useEffect, useMemo } from "react";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { AccountingVisual } from "@/components/AccountingVisual";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import {
  faqs,
  fit,
  flow,
  landingDescription,
  landingPage,
  landingTitle,
  landingWhatsappUrl,
  problems,
  steps,
} from "@/lib/accountingLanding";
import { IntelligenceCore } from "@/components/IntelligenceCore";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Art } from "@/components/home/Art";
import { initTracking, trackWhatsappClick } from "@/lib/tracking";
import { useButtonFeedback } from "@/hooks/useButtonFeedback";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import "./styles/landing.css";

export default function AccountingLanding() {
  const revealRef = useScrollReveal();
  useButtonFeedback();
  const href = useMemo(() => landingWhatsappUrl(window.location.search), []);
  useEffect(() => {
    document.title = landingTitle;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", landingDescription);
    initTracking();
  }, []);
  const whatsapp = (placement: string) => ({
    href,
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: () => trackWhatsappClick(landingPage, placement),
  });
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="nx-header">
        <div className="nx-wrap nx-header-inner">
          <Brand />
          <Button size="lg" asChild>
            <a {...whatsapp("header")}>
              <MessageCircle data-icon="inline-start" /> WhatsApp
            </a>
          </Button>
        </div>
      </header>
      <main id="conteudo" ref={revealRef}>
        <section className="lp-hero nx-hero nx-wrap" aria-labelledby="lp-hero-title">
          <h1 id="lp-hero-title" className="nx-display">
            <span>Pare de correr atrás</span>{" "}
            <span>de documento todo mês.</span>
          </h1>
          <div className="nx-hero-core nx-core" aria-hidden="true">
            <IntelligenceCore />
          </div>
          <div className="nx-hero-foot">
            <p className="nx-lead">
              A Nexo cria automações sob medida para escritórios de
              contabilidade: documentos dos clientes organizados e menos
              trabalho manual para a sua equipe.
            </p>
            <div className="nx-actions">
              <Button size="lg" asChild>
                <a {...whatsapp("hero")}>
                  Falar com a Nexo no WhatsApp{" "}
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
            </div>
            <p className="nx-body nx-soft">
              Conversa inicial de 20 minutos, sem custo.
            </p>
          </div>
          <Art name="docs" className="nx-hero-photo nx-reveal" />
        </section>
        <section className="nx-section nx-wrap" aria-labelledby="lp-problems-title">
          <div className="nx-process-head">
            <h2 id="lp-problems-title" className="nx-h2 nx-reveal">
              A rotina não precisa
              <br />
              ser tão manual.
            </h2>
          </div>
          {problems.map((problem) => (
            <article className="nx-benefit nx-reveal" key={problem.title}>
              <h3 className="nx-h3">{problem.title}</h3>
              <p className="nx-body nx-soft">{problem.text}</p>
            </article>
          ))}
        </section>
        <section className="nx-section nx-band" aria-labelledby="lp-steps-title">
          <div className="nx-process-head">
            <h2 id="lp-steps-title" className="nx-h2 nx-reveal">
              Do primeiro contato
              <br />à rotina funcionando.
            </h2>
          </div>
          <ol className="nx-stages nx-stages-3">
            {steps.map((step) => (
              <li className="nx-stage nx-reveal" key={step.title}>
                <h3 className="nx-h3">{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="nx-photo-pair">
            <Art name="talk" className="nx-reveal" />
            <Art name="plan" className="nx-reveal" />
          </div>
        </section>
        <section className="nx-section nx-wrap nx-split" aria-labelledby="lp-demo-title">
          <div className="nx-split-text">
            <h2 id="lp-demo-title" className="nx-h2 nx-reveal">
              Um exemplo de como
              <br />
              isso funciona.
            </h2>
            <p className="nx-lead nx-reveal">
              Uma automação organiza o material do período e a sua equipe
              confere antes do registro final. Exemplo ilustrativo.
            </p>
            <ol className="nx-flow">
              {flow.map((event) => (
                <li key={event.label} className="nx-reveal">
                  <strong>{event.label}.</strong> {event.text}
                </li>
              ))}
            </ol>
          </div>
          <AccountingVisual />
        </section>
        <section className="nx-section nx-wrap" aria-labelledby="lp-offer-title">
          <Art name="flow" className="nx-reveal nx-offer-photo" />
          <div className="nx-process-head">
            <h2 id="lp-offer-title" className="nx-h2 nx-reveal">
              20 minutos para entender
              <br />a sua rotina.
            </h2>
          </div>
          <div className="nx-benefit nx-reveal">
            <h3 className="nx-h3">Para quem é</h3>
            <ul className="nx-list">
              {fit.yes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="nx-benefit nx-reveal">
            <h3 className="nx-h3">O que a Nexo é</h3>
            <ul className="nx-list">
              {fit.no.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
        <section className="nx-section nx-wrap nx-faq" aria-labelledby="lp-faq-title">
          <div className="nx-faq-row">
            <h2 id="lp-faq-title" className="nx-faq-q nx-faq-title nx-reveal">
              Vamos tirar as dúvidas.
            </h2>
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
      </main>
      <div className="nx-inverse nx-close">
        <section className="nx-wrap nx-cta" aria-labelledby="lp-contact-title">
          <h2 id="lp-contact-title" className="nx-display nx-cta-title nx-reveal">
            Vamos olhar a rotina
            <br />
            do seu escritório?
          </h2>
          <div className="nx-cta-foot">
            <p className="nx-lead">
              Conte como o escritório trabalha hoje e veja o que dá para
              automatizar. Conversa inicial de 20 minutos, sem custo.
            </p>
            <Button size="lg" asChild className="nx-cta-button">
              <a {...whatsapp("footer")}>
                Falar com a Nexo no WhatsApp{" "}
                <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </section>
        <footer className="nx-wrap nx-footer">
          <div className="nx-footer-legal">
            <p>© {new Date().getFullYear()} Nexo. Todos os direitos reservados.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
