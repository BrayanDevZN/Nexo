import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { StreamingDemo } from "@/components/StreamingDemo";
import { Value } from "@/components/home/Value";
import { Faq } from "@/components/home/Faq";
import { Close } from "@/components/home/Close";
import { Intro } from "@/components/rp/Intro";
import { Journey } from "@/components/rp/Journey";
import { Particles } from "@/components/rp/Particles";
import { Scene } from "@/components/rp/Scene";
import { contactUrl } from "@/lib/content";
import { useButtonFeedback } from "@/hooks/useButtonFeedback";
import { useSectionNavigation } from "@/hooks/useSectionNavigation";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export default function App() {
  const revealRef = useScrollReveal();
  // The opening plays on every visit to the home page, except when a link points at a section.
  const [intro, setIntro] = useState(() => !window.location.hash);
  const [started, setStarted] = useState(() => !!window.location.hash);
  useSectionNavigation();
  useButtonFeedback();
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      {intro ? <Intro onStart={() => setStarted(true)} onEnter={() => setIntro(false)} /> : null}
      <Scene />
      <Particles />
      <SiteHeader cta={{ href: contactUrl, label: "WhatsApp" }} />
      <main id="conteudo" ref={revealRef} className="rp-page">
        <Journey play={started} />
        <div className="rp-content">
          <StreamingDemo />
          <Value />
          <Faq />
        </div>
      </main>
      <Close />
    </>
  );
}
