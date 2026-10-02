import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CircuitBoard,
  Layers3,
  MoveUpRight,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Brand } from "@/components/Brand";
import { OperationVisual } from "@/components/OperationVisual";
import { StreamingDemo } from "@/components/StreamingDemo";
import { SolutionsCarousel } from "@/components/SolutionsCarousel";
import { useButtonFeedback } from "@/hooks/useButtonFeedback";
import { useSectionNavigation } from "@/hooks/useSectionNavigation";
import { BusinessValue } from "@/components/BusinessValue";
import { Process } from "@/components/Process";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { contactUrl, faqs, navigation } from "@/lib/content";

import { useScrollReveal } from "@/hooks/useScrollReveal";

export default function App() {
  const revealRef = useScrollReveal();
  useSectionNavigation();
  useButtonFeedback();
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <SiteHeader />
      <main id="conteudo" ref={revealRef}>
        <section
          id="inicio"
          className="hero shell"
          aria-labelledby="hero-title"
        >
          <div className="hero-content">
            <Badge variant="outline">
              <span className="signal-dot" /> INTELIGÊNCIA ARTIFICIAL APLICADA
            </Badge>
            <h1 id="hero-title">
              Menos tarefas.
              <br />
              Mais capacidade.
              <br />
              <span>Esse é o nexo.</span>
            </h1>
            <p>
              Analisamos seu negócio e integramos IA para automatizar processos,
              conectar sistemas e liberar sua equipe para o que faz a empresa
              crescer.
            </p>
            <div className="hero-actions">
              <Button size="lg" asChild>
                <a href={contactUrl} target="_blank" rel="noopener noreferrer">
                  Encontrar oportunidades{" "}
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
              <Button variant="ghost" size="lg" asChild>
                <a href="#solucoes">
                  Explorar soluções <ArrowDown data-icon="inline-end" />
                </a>
              </Button>
            </div>
            <div className="hero-note">
              <p>DO DIAGNÓSTICO À SOLUÇÃO EM PRODUÇÃO</p>
            </div>
          </div>
          <OperationVisual />
        </section>
        <div className="shell outcomes" aria-label="Objetivos da transformação">
          <div>
            <span>01</span>
            <p>Menos trabalho manual</p>
          </div>
          <div>
            <span>02</span>
            <p>Processos conectados</p>
          </div>
          <div>
            <span>03</span>
            <p>Mais capacidade operacional</p>
          </div>
          <ArrowUpRight aria-hidden="true" />
        </div>
        <section
          id="solucoes"
          className="section shell"
          aria-labelledby="solutions-title"
        >
          <div className="section-heading heading-split">
            <div>
              <p className="eyebrow">01 / O QUE CONSTRUÍMOS</p>
              <h2 id="solutions-title">
                IA onde o trabalho
                <br />
                <span>realmente acontece.</span>
              </h2>
            </div>
            <p className="section-description">
              Conectamos inteligência artificial, software e dados para resolver
              os gargalos da sua operação.
            </p>
          </div>
          <SolutionsCarousel />
          <div className="solutions-note">
            <CircuitBoard className="size-5" aria-hidden="true" />
            <p>
              Você não precisa escolher a ferramenta. Precisa saber qual
              problema quer resolver.
            </p>
          </div>
        </section>
        <Process />
        <StreamingDemo />
        <BusinessValue />
        <section
          id="sobre"
          className="section section-tinted"
          aria-labelledby="about-title"
        >
          <div className="shell about-grid">
            <div>
              <p className="eyebrow">04 / A NEXO</p>
              <h2 id="about-title">
                A conexão entre
                <br />o seu negócio
                <br />
                <span>e o próximo passo.</span>
              </h2>
              <p className="about-lead">
                Somos uma agência de inteligência artificial que começa pelo
                negócio.
              </p>
              <p className="body-copy">
                Entendemos como sua empresa funciona, identificamos o que trava
                a operação e construímos soluções para reduzir a carga de
                trabalho das equipes.
              </p>
            </div>
            <div className="principles">
              {[
                {
                  icon: MoveUpRight,
                  title: "Impacto antes da ferramenta",
                  text: "O projeto começa com um problema concreto e critérios claros para avaliar a solução.",
                },
                {
                  icon: Layers3,
                  title: "Integração com a realidade",
                  text: "Dados, sistemas e pessoas fazem parte da arquitetura. A solução precisa funcionar na rotina.",
                },
                {
                  icon: ShieldCheck,
                  title: "Autonomia com controle",
                  text: "Regras, rastreabilidade e pontos de revisão humana definidos para cada processo.",
                },
              ].map((principle, index) => (
                <div key={principle.title}>
                  <article>
                    <principle.icon
                      className="size-6 text-primary"
                      aria-hidden="true"
                    />
                    <div>
                      <h3>{principle.title}</h3>
                      <p className="body-copy">{principle.text}</p>
                    </div>
                  </article>
                  {index < 2 && <Separator />}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="section shell faq-grid" aria-labelledby="faq-title">
          <div>
            <p className="eyebrow">ANTES DO PRIMEIRO PASSO</p>
            <h2 id="faq-title">
              Vamos tirar
              <br />
              <span>as dúvidas.</span>
            </h2>
            <p className="section-description">
              Cada operação tem seu contexto.
              <br />A conversa começa por ele.
            </p>
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
          id="contato"
          className="shell contact-section"
          aria-labelledby="contact-title"
        >
          <div className="contact-panel">
            <div className="contact-decoration" aria-hidden="true">
              <Brand compact />
            </div>
            <p className="eyebrow">O PRÓXIMO PASSO COMEÇA COM UMA CONVERSA</p>
            <h2 id="contact-title">
              Sua equipe pode
              <br />
              <span>ir além do operacional.</span>
            </h2>
            <p>
              Conte onde o trabalho está travando.
              <br />
              Vamos entender o problema e avaliar o que podemos construir.
            </p>
            <Button size="lg" asChild>
              <a href={contactUrl} target="_blank" rel="noopener noreferrer">
                Vamos encontrar o nexo <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
            <span className="contact-note">
              PROJETOS SOB MEDIDA PARA A SUA OPERAÇÃO
            </span>
          </div>
        </section>
      </main>
      <footer className="shell footer">
        <div className="footer-top">
          <a href="#inicio" aria-label="Nexo: voltar ao início">
            <Brand />
          </a>
          <p>
            Inteligência que conecta.
            <br />
            Tecnologia que transforma.
          </p>
          <nav aria-label="Navegação do rodapé">
            {navigation.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
            <a href={contactUrl} target="_blank" rel="noopener noreferrer">
              Contato <ArrowUpRight className="size-3" aria-hidden="true" />
            </a>
          </nav>
        </div>
        <Separator />
        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} Nexo. Todos os direitos reservados.
          </p>
          <a href="#inicio">
            Voltar ao topo{" "}
            <ArrowRight className="size-3 -rotate-90" aria-hidden="true" />
          </a>
        </div>
      </footer>
    </>
  );
}
