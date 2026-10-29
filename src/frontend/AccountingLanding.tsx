import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { AccountingVisual } from "@/components/AccountingVisual";
import { Faq } from "@/components/home/Faq";
import { Close } from "@/components/home/Close";
import { Intro } from "@/components/rp/Intro";
import { Journey } from "@/components/rp/Journey";
import { Particles } from "@/components/rp/Particles";
import { Scene } from "@/components/rp/Scene";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  benefits,
  faqs,
  fit,
  flow,
  landingDescription,
  landingPage,
  landingTitle,
  landingWhatsappUrl,
  stations,
} from "@/lib/accountingLanding";
import { recordVisit, recordWhatsappClick } from "@/lib/paidLeads";
import { trackWhatsappClick } from "@/lib/tracking";
import { useButtonFeedback } from "@/hooks/useButtonFeedback";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useSectionNavigation } from "@/hooks/useSectionNavigation";
import "./styles/landing.css";

const entries = [
  { href: "#inicio", label: "Início" },
  { href: "#agentes", label: "Agentes" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#demonstracao", label: "Na prática" },
  { href: "#duvidas", label: "Dúvidas" },
  { href: "#contato", label: "Contato" },
];

/** The accounting landing page, in the same 3D journey as the home page, with a 3D object for each topic. */
export default function AccountingLanding() {
  const revealRef = useScrollReveal();
  useButtonFeedback();
  useSectionNavigation();
  // Same opening as the home page, except when a link points at a section.
  const [intro, setIntro] = useState(() => !window.location.hash);
  const [started, setStarted] = useState(() => !!window.location.hash);
  const href = useMemo(() => landingWhatsappUrl(window.location.search), []);
  useEffect(() => {
    document.title = landingTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content", landingDescription);
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
      {intro ? <Intro onStart={() => setStarted(true)} onEnter={() => setIntro(false)} /> : null}
      <Scene stations={stations} />
      <Particles />
      <SiteHeader entries={entries} cta={{ ...whatsapp("header"), label: "WhatsApp" }} />
      <main id="conteudo" ref={revealRef} className="rp-page">
        <Journey
          play={started}
          stations={stations}
          label="Nexo para contabilidade"
          actions={(index) =>
            index === 0 ? (
              <div className="rp-actions">
                <a className="rp-link rp-whats" {...whatsapp("hero")}>
                  <MessageCircle aria-hidden="true" /> Falar no WhatsApp
                </a>
                <a className="rp-link" href="#agentes">
                  Ver os agentes <ArrowUpRight aria-hidden="true" />
                </a>
              </div>
            ) : null
          }
        />
        <div className="rp-content">
          <section id="demonstracao" className="nx-section nx-wrap nx-split" aria-labelledby="lp-demo-title">
            <div className="nx-split-text">
              <h2 id="lp-demo-title" className="nx-h2 nx-reveal">
                Um exemplo de como
                <br />
                isso funciona.
              </h2>
              <p className="nx-lead nx-reveal">
                Uma automação organiza o material do período e a sua equipe confere antes do registro final. Exemplo
                ilustrativo.
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

          <section id="valor" className="nx-section nx-wrap" aria-labelledby="lp-value-title">
            <div className="nx-process-head">
              <h2 id="lp-value-title" className="nx-h2 nx-reveal">
                Mais capacidade
                <br />
                para o escritório.
              </h2>
              <p className="nx-lead nx-reveal">
                O ganho aparece na rotina: menos retrabalho e mais clientes atendidos com a mesma equipe.
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
              <Button size="lg" asChild className="h-auto max-w-full whitespace-normal py-2.5">
                <a {...whatsapp("middle")}>
                  Falar com a Nexo no WhatsApp <ArrowUpRight data-icon="inline-end" />
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
          </section>

          <Faq faqs={faqs} note="Cada escritório tem a sua rotina. A conversa começa por ela." />
        </div>
      </main>
      <Close
        title={["Vamos olhar a rotina", "do seu escritório?"]}
        lead="Conte como o escritório trabalha hoje e veja o que dá para automatizar. Conversa inicial de 20 minutos, sem custo."
        link={whatsapp("footer")}
        nav={[
          { href: "#agentes", label: "Agentes" },
          { href: "#como-funciona", label: "Como funciona" },
          { href: "#duvidas", label: "Dúvidas" },
          { href: "#contato", label: "Contato" },
        ]}
      />
    </>
  );
}
