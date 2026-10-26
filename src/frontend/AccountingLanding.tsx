import { useEffect, useMemo } from "react";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  solutions,
  benefits,
  principles,
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
import { CookiePreferencesButton } from "@/components/CookieNotice";
import { recordVisit, recordWhatsappClick } from "@/lib/paidLeads";
import { trackWhatsappClick } from "@/lib/tracking";
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
    void recordVisit(landingPage, window.location.search);
  }, []);
  const whatsapp = (placement: string) => ({
    href,
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: () => {
      trackWhatsappClick(landingPage, placement);
      void recordWhatsappClick(placement);
    },
  });
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="nx-header">
        <div className="nx-wrap nx-header-inner">
          <Brand />
          <nav className="nx-nav" aria-label="Seções da página">
            <a href="#agentes">Agentes</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#na-pratica">Na prática</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
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
              A Nexo cria agentes de IA para escritórios de contabilidade:
              agentes que atendem os seus clientes, agentes que ajudam na
              rotina contábil e automações que organizam os documentos. A sua
              equipe foca no que exige análise.
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
            <p className="nx-lead nx-reveal">
              Se algum destes pontos é do dia a dia do seu escritório, dá para
              tirar do caminho da equipe.
            </p>
          </div>
          <div className="nx-card-grid">
            {problems.map((problem) => (
              <Card key={problem.title} className="nx-lift nx-reveal">
                <CardHeader>
                  <problem.icon className="size-6 text-primary" aria-hidden="true" />
                  <CardTitle>{problem.title}</CardTitle>
                  <CardDescription>{problem.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section id="agentes" className="nx-section nx-wrap nx-features" aria-labelledby="lp-agents-title">
          <div className="nx-features-head">
            <h2 id="lp-agents-title" className="nx-h2 nx-reveal">
              Agentes de IA que
              <br />
              trabalham pelo escritório.
            </h2>
            <p className="nx-lead nx-reveal">
              Cada agente é montado para uma tarefa do escritório, com regras
              claras e a revisão da sua equipe.
            </p>
          </div>
          {solutions.map((solution) => (
            <article className="nx-row" key={solution.title}>
              <div className="nx-row-body nx-reveal">
                <h3 className="nx-h3">{solution.title}</h3>
                <p className="nx-body">{solution.text}</p>
                <ul className="nx-list">
                  {solution.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <Art name={solution.art} className="nx-reveal" />
            </article>
          ))}
        </section>

        <section id="como-funciona" className="nx-section nx-band" aria-labelledby="lp-steps-title">
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

        <section id="na-pratica" className="nx-section nx-wrap nx-split" aria-labelledby="lp-demo-title">
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

        <section className="nx-section nx-wrap" aria-labelledby="lp-value-title">
          <div className="nx-process-head">
            <h2 id="lp-value-title" className="nx-h2 nx-reveal">
              Mais capacidade
              <br />
              para o escritório.
            </h2>
            <p className="nx-lead nx-reveal">
              O ganho aparece na rotina: menos retrabalho e mais clientes
              atendidos com a mesma equipe.
            </p>
          </div>
          <div className="nx-card-grid nx-card-grid-4">
            {benefits.map((benefit) => (
              <Card key={benefit.title} className="nx-lift nx-reveal">
                <CardHeader>
                  <CardTitle>{benefit.title}</CardTitle>
                  <CardDescription>{benefit.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
          <div className="nx-value-cta nx-reveal">
            <p className="nx-lead">Quer ver o que dá para fazer no seu escritório?</p>
            <Button size="lg" asChild>
              <a {...whatsapp("middle")}>
                Falar com a Nexo no WhatsApp{" "}
                <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </section>

        <section className="nx-section nx-band" aria-labelledby="lp-offer-title">
          <div className="nx-process-head">
            <h2 id="lp-offer-title" className="nx-h2 nx-reveal">
              20 minutos para entender
              <br />a sua rotina.
            </h2>
          </div>
          <div className="nx-offer-grid">
            <Art name="flow" className="nx-reveal" />
            <div className="nx-offer-text">
              <div className="nx-reveal">
                <h3 className="nx-h3">Para quem é</h3>
                <ul className="nx-list">
                  {fit.yes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="nx-reveal">
                <h3 className="nx-h3">O que a Nexo é</h3>
                <ul className="nx-list">
                  {fit.no.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="nx-section nx-wrap nx-about" aria-labelledby="lp-about-title">
          <div className="nx-about-main">
            <h2 id="lp-about-title" className="nx-h2 nx-reveal">
              Quem constrói
              <br />
              os agentes.
            </h2>
            <p className="nx-statement nx-reveal">
              A Nexo é uma agência de inteligência artificial. Criamos agentes
              e automações para empresas, e para escritórios de contabilidade
              desenhamos cada um a partir da rotina real da equipe.
            </p>
            <div className="nx-principles">
              {principles.map((principle) => (
                <div key={principle.title} className="nx-reveal">
                  <h3>{principle.title}</h3>
                  <p className="nx-body nx-soft">{principle.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="duvidas" className="nx-section nx-wrap nx-faq" aria-labelledby="lp-faq-title">
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
            <a href="/privacidade">Política de privacidade</a>
            <a href="mailto:nexo.bd.owners@gmail.com">nexo.bd.owners@gmail.com</a>
            <CookiePreferencesButton />
          </div>
        </footer>
      </div>
    </>
  );
}
