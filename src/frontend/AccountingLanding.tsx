import { useEffect, useMemo } from "react";
import { ArrowUpRight, Check, MessageCircle } from "lucide-react";
import { AccountingVisual } from "@/components/AccountingVisual";
import { Brand } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  faqs,
  fit,
  flow,
  landingDescription,
  landingPage,
  landingTitle,
  landingWhatsappUrl,
  outcomes,
  problems,
  steps,
} from "@/lib/accountingLanding";
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
      <header className="site-header">
        <div className="shell header-inner">
          <Brand />
          <Button size="lg" asChild>
            <a {...whatsapp("header")}>
              <MessageCircle data-icon="inline-start" /> WhatsApp
            </a>
          </Button>
        </div>
      </header>
      <main id="conteudo" ref={revealRef}>
        <section className="lp-hero shell" aria-labelledby="lp-hero-title">
          <div className="lp-hero-copy">
            <Badge variant="outline">
              <span className="signal-dot" /> AUTOMAÇÃO PARA ESCRITÓRIOS DE
              CONTABILIDADE
            </Badge>
            <h1 id="lp-hero-title">
              Pare de correr atrás de documento <span>todo mês.</span>
            </h1>
            <p>
              A Nexo cria automações sob medida para escritórios de contabilidade:
              documentos dos clientes organizados e menos trabalho manual para a
              sua equipe.
            </p>
            <div className="lp-hero-actions">
              <Button size="lg" asChild>
                <a {...whatsapp("hero")}>
                  Falar com a Nexo no WhatsApp{" "}
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
              <span className="lp-note">
                CONVERSA INICIAL DE 20 MINUTOS, SEM CUSTO
              </span>
            </div>
          </div>
          <AccountingVisual />
        </section>
        <div className="shell outcomes" aria-label="Objetivos da automação">
          {outcomes.map((outcome, index) => (
            <div key={outcome}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{outcome}</p>
            </div>
          ))}
          <ArrowUpRight aria-hidden="true" />
        </div>
        <section
          className="section shell"
          aria-labelledby="lp-problems-title"
        >
          <div className="section-heading">
            <p className="eyebrow">01 / SE ISSO SOA FAMILIAR</p>
            <h2 id="lp-problems-title">
              A rotina do escritório não precisa
              <br />
              <span>ser tão manual.</span>
            </h2>
          </div>
          <div className="lp-grid">
            {problems.map((problem) => (
              <Card key={problem.title}>
                <CardHeader>
                  <problem.icon
                    className="size-6 text-primary"
                    aria-hidden="true"
                  />
                  <CardTitle>{problem.title}</CardTitle>
                  <CardDescription>{problem.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
        <section
          className="section section-tinted"
          aria-labelledby="lp-steps-title"
        >
          <div className="shell">
            <div className="section-heading">
              <p className="eyebrow">02 / COMO FUNCIONA</p>
              <h2 id="lp-steps-title">
                Do primeiro contato
                <br />
                <span>à rotina funcionando.</span>
              </h2>
            </div>
            <ol className="lp-steps">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className="lp-step-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3>{step.title}</h3>
                  <p className="body-copy">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section
          className="section shell lp-split"
          aria-labelledby="lp-demo-title"
        >
          <div>
            <p className="eyebrow">03 / NA PRÁTICA</p>
            <h2 id="lp-demo-title">
              Um exemplo de como
              <br />
              <span>isso funciona.</span>
            </h2>
            <p className="section-description">
              Uma automação organiza o material e a sua equipe decide.
            </p>
          </div>
          <Card>
            <CardHeader>
              <Badge variant="secondary">EXEMPLO ILUSTRATIVO</Badge>
              <CardTitle>Do extrato ao resumo para conferência</CardTitle>
              <CardDescription>
                A automação organiza o material do período e a sua equipe
                confere antes do registro final.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="lp-flow">
                {flow.map((event) => (
                  <li key={event.label}>
                    <Check aria-hidden="true" />
                    <div>
                      <strong>{event.label}</strong>
                      <p>{event.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
        <section
          className="section section-tinted"
          aria-labelledby="lp-offer-title"
        >
          <div className="shell">
            <div className="section-heading">
              <p className="eyebrow">04 / A CONVERSA INICIAL</p>
              <h2 id="lp-offer-title">
                20 minutos para entender
                <br />
                <span>a sua rotina.</span>
              </h2>
            </div>
            <div className="lp-fit">
              <Card>
                <CardHeader>
                  <CardTitle>Para quem é</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="lp-list">
                    {fit.yes.map((item) => (
                      <li key={item}>
                        <Check aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>O que a Nexo é</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="lp-list">
                    {fit.no.map((item) => (
                      <li key={item}>
                        <Check aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
        <section
          className="section shell faq-grid"
          aria-labelledby="lp-faq-title"
        >
          <div>
            <p className="eyebrow">ANTES DO PRIMEIRO PASSO</p>
            <h2 id="lp-faq-title">
              Vamos tirar
              <br />
              <span>as dúvidas.</span>
            </h2>
          </div>
          <Accordion type="single" collapsible>
            {faqs.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index}`}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
        <section
          className="shell contact-section"
          aria-labelledby="lp-contact-title"
        >
          <div className="contact-panel">
            <div className="contact-decoration" aria-hidden="true">
              <Brand compact />
            </div>
            <p className="eyebrow">O PRÓXIMO PASSO</p>
            <h2 id="lp-contact-title">
              Vamos olhar a rotina
              <br />
              <span>do seu escritório?</span>
            </h2>
            <p>
              Conte como o escritório trabalha hoje e veja o que dá para
              automatizar.
            </p>
            <Button size="lg" asChild>
              <a {...whatsapp("footer")}>
                Falar com a Nexo no WhatsApp{" "}
                <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
            <span className="contact-note">
              CONVERSA INICIAL DE 20 MINUTOS, SEM CUSTO
            </span>
          </div>
        </section>
      </main>
      <footer className="shell footer">
        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} Nexo. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </>
  );
}
