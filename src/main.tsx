import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import "./styles/GoldTheme.css";
import { initScrollAnimations } from "./utils/animations/scrollAnimations";

function Root() {
  useEffect(() => {
    return initScrollAnimations();
  }, []);

  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
