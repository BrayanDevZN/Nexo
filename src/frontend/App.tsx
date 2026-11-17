import { useEffect } from "react";
import { ChatDemo } from "@/components/lelab/ChatDemo";
import { Value } from "@/components/home/Value";
import { Faq } from "@/components/home/Faq";
import { Close } from "@/components/home/Close";
import { LeHeader } from "@/components/lelab/LeHeader";
import { Hero } from "@/components/lelab/Hero";
import { About, Marquee, Process, Services } from "@/components/lelab/Services";
import { useButtonFeedback } from "@/hooks/useButtonFeedback";
import { useSectionNavigation } from "@/hooks/useSectionNavigation";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export default function App() {
  const revealRef = useScrollReveal();
  useSectionNavigation();
  useButtonFeedback();
  // Scopes the home's own look (lelab.css) to this page only.
  useEffect(() => {
    document.documentElement.classList.add("ll-home");
    return () => document.documentElement.classList.remove("ll-home");
  }, []);
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <LeHeader />
      <main id="conteudo" ref={revealRef} className="rp-page">
        <Hero />
        <Marquee />
        <Services />
        <Process />
        <About />
        <div className="rp-content">
          <ChatDemo />
          <Value />
          <Faq />
        </div>
      </main>
      <Close />
    </>
  );
}
