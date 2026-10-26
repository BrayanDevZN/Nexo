import { SiteHeader } from "@/components/SiteHeader";
import { StreamingDemo } from "@/components/StreamingDemo";
import { Hero } from "@/components/home/Hero";
import { Features } from "@/components/home/Features";
import { Process } from "@/components/home/Process";
import { Value } from "@/components/home/Value";
import { About } from "@/components/home/About";
import { Faq } from "@/components/home/Faq";
import { Close } from "@/components/home/Close";
import { useButtonFeedback } from "@/hooks/useButtonFeedback";
import { useSectionNavigation } from "@/hooks/useSectionNavigation";
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
        <Hero />
        <Features />
        <Process />
        <StreamingDemo />
        <Value />
        <About />
        <Faq />
      </main>
      <Close />
    </>
  );
}
