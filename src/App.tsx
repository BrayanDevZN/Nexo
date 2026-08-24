import Navbar from "./components/Navbar/Navbar";
import Hero from "./components/Hero/Hero";
import Problem from "./components/Problem/Problem";
import Analysis from "./components/Analysis/Analysis";
import Development from "./components/Development/Development";
import About from "./components/About/About";
import CTA from "./components/CTA/CTA";

function App() {
  return (
    <>
      <Navbar />

      <main>
        <Hero />
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