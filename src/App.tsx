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
        <section className="home-section" id="inicio">
          <Hero />
        </section>
        <Problem />
        <Analysis />
        <Development />
        <About />
        <CTA />
      </main>
    </>
  );
}

export default App;
