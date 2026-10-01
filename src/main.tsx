import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { MotionProvider } from "./components/MotionProvider";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionProvider>
      <AnimatedBackground />
      <App />
    </MotionProvider>
  </StrictMode>,
);
