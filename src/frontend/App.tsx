import { useEffect, useRef } from "react";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { useButtonFeedback } from "@/hooks/useButtonFeedback";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useSectionNavigation } from "@/hooks/useSectionNavigation";
import { contactUrl, heroLine, heroPhotos, intro, lead, navigation, ORB_WIDTHS, photoSrcSet, SERVICE_WIDTHS, services, steps, strip } from "@/lib/vet";
import "./styles/vet.css";

const orbs = [...heroPhotos.left, ...heroPhotos.right, ...heroPhotos.podium];

/** The public home: services for veterinary clinics. Solid green, huge type, real photos. */
export default function App() {
  const revealRef = useScrollReveal();
  useSectionNavigation();
  useButtonFeedback();
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // The floating photos only animate while the hero is on screen: no wasted frames further down.
    const hero = heroRef.current;
    if (!hero || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => hero.classList.toggle("is-away", !entry.isIntersecting));
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    document.documentElement.classList.add("vt-home");
    document.title = "Nexo | Serviços para clínicas veterinárias";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        "A Nexo cuida dos clientes e dos números da sua clínica veterinária: atendimento no WhatsApp, agendamento, lembretes de vacina, avaliações no Google, financeiro, estoque e relatórios mensais.",
      );
    return () => document.documentElement.classList.remove("vt-home");
  }, []);
  return (
    <div className="vt">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="vt-header">
        <a className="vt-logo" href="#inicio" aria-label="Nexo: início">
          <span className="vt-chip">
            <img src="/images/nexo-symbol-light.png" alt="" width="40" height="40" />
          </span>
          <span className="vt-logo-text">nexo</span>
        </a>
        <nav aria-label="Principal">
          <ul>
            {navigation.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <a className="vt-round" href={contactUrl} target="_blank" rel="noopener noreferrer" aria-label="Falar com a Nexo no WhatsApp">
          <MessageCircle aria-hidden="true" />
        </a>
        <a className="vt-pill vt-pill-header" href={contactUrl} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
      </header>

      <main id="conteudo" ref={revealRef}>
        <section id="inicio" ref={heroRef} className="vt-hero" aria-labelledby="vt-hero-title">
          <div className="vt-stage">
            {orbs.map((orb) => (
              <img
                key={orb.src}
                className={`vt-orb ${orb.cls}`}
                src={`${orb.src}-240.webp`}
                srcSet={photoSrcSet(orb.src, ORB_WIDTHS)}
                sizes="(max-width: 760px) 27vw, 260px"
                alt={orb.alt}
                width="240"
                height="240"
                decoding="async"
              />
            ))}
            <div className="vt-podium">
              <h1 id="vt-hero-title">
                <img className="vt-wordmark" src="/images/nexo-logo-green.png" alt="Nexo" width="520" height="163" fetchPriority="high" />
                <span className="vt-sr">Serviços para clínicas veterinárias</span>
              </h1>
              <span className="vt-podium-label" aria-hidden="true">
                Clínicas veterinárias
              </span>
            </div>
          </div>
          <a className="vt-scroll" href="#intro" aria-label="Rolar para baixo">
            <span className="vt-mouse">
              <span />
            </span>
            Rolar
          </a>
        </section>

        <section id="intro" className="vt-intro">
          <p className="vt-kicker nx-reveal">Nexo | Serviços para clínicas veterinárias</p>
          <h2 className="vt-big nx-reveal">
            Serviços para clínicas veterinárias
            <span>{heroLine}</span>
          </h2>
          <p className="vt-lead nx-reveal">{lead}</p>
          <p className="vt-text nx-reveal">{intro}</p>
          <a className="vt-pill nx-reveal" href={contactUrl} target="_blank" rel="noopener noreferrer">
            Falar no WhatsApp <ArrowUpRight aria-hidden="true" />
          </a>
        </section>

        <div id="servicos">
          {services.map((service, index) => (
            <section key={service.id} id={service.id} className={`vt-service${index % 2 ? " vt-flip" : ""}`} aria-labelledby={`${service.id}-titulo`}>
              <figure className="vt-photo nx-reveal">
                <img
                  src={`${service.image}-640.webp`}
                  srcSet={photoSrcSet(service.image, SERVICE_WIDTHS)}
                  sizes="(max-width: 900px) 92vw, 600px"
                  alt={service.alt}
                  loading="lazy"
                  decoding="async"
                  width="1200"
                  height="900"
                />
              </figure>
              <div className="vt-copy">
                <p className="vt-number nx-reveal">{service.number}</p>
                <h3 id={`${service.id}-titulo`} className="nx-reveal">
                  {service.title}
                </h3>
                <p className="vt-summary nx-reveal">{service.summary}</p>
                <ul className="vt-points nx-reveal">
                  {service.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                {service.note ? <p className="vt-note nx-reveal">{service.note}</p> : null}
              </div>
            </section>
          ))}
        </div>

        <section id="como-comecamos" className="vt-steps" aria-labelledby="vt-steps-title">
          <h2 id="vt-steps-title" className="vt-big vt-big-sm nx-reveal">
            Como começamos
          </h2>
          <ol>
            {steps.map((step, index) => (
              <li key={step.title} className="nx-reveal">
                <span className="vt-number">{String(index + 1).padStart(2, "0")}</span>
                <strong>{step.title}</strong>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="contato" className="vt-contact" aria-labelledby="vt-contact-title">
          <div className="vt-strip" aria-hidden="true">
            {strip.map((src) => (
              <img key={src} src={`${src}-240.webp`} alt="" loading="lazy" decoding="async" width="120" height="120" />
            ))}
          </div>
          <h2 id="vt-contact-title" className="vt-big vt-big-sm nx-reveal">
            Vamos conversar?
          </h2>
          <p className="vt-text nx-reveal">Uma conversa de 20 minutos pra entender a rotina da sua clínica, os serviços que você oferece e onde sua equipe perde mais tempo. Depois, 30 dias de teste sem custo, pra você ver o resultado antes de decidir.</p>
          <a className="vt-pill nx-reveal" href={contactUrl} target="_blank" rel="noopener noreferrer">
            Contato <ArrowUpRight aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer className="vt-footer">
        <a className="vt-logo" href="#inicio" aria-label="Nexo: voltar ao início">
          <span className="vt-chip">
            <img src="/images/nexo-symbol-light.png" alt="" width="40" height="40" />
          </span>
          <span className="vt-logo-text">nexo</span>
        </a>
        <p>
          © {new Date().getFullYear()} Nexo. Todos os direitos reservados. <a href="/privacidade">Privacidade</a>
        </p>
      </footer>
    </div>
  );
}
