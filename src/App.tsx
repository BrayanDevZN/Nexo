import Navbar from "./components/Navbar/Navbar";
import Hero from "./components/Hero/Hero";
import Problem from "./components/Problem/Problem";
import Analysis from "./components/Analysis/Analysis";
import Development from "./components/Development/Development";
import About from "./components/About/About";
import CTA from "./components/CTA/CTA";
import GoldenRain from "./components/GoldenRain/GoldenRain";

function App() {
  return (
    <>
      <GoldenRain />
      <Navbar />

      <main>
        <section className="site-section home-section" id="inicio">
          <Hero />
        </section>
        <section className="site-section problem-section" id="problema">
          <Problem />
        </section>
        <section className="site-section analysis-section" id="analise">
          <Analysis />
        </section>
        <section
          className="site-section development-section"
          id="desenvolvimento"
        >
          <Development />
        </section>
        <section className="site-section about-section" id="sobre">
          <About />
        </section>
        <section className="site-section contact-section" id="contato">
          <CTA />
        </section>
      </main>
    </>
  );
}

export default App;
