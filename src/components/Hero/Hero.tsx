import { lazy, Suspense, useEffect, useState } from "react";

const HeroScene = lazy(
  () => import("../../components3d/HeroScene/HeroScene"),
);

function ScenePlaceholder() {
  return <div className="hero-scene hero-scene--loading" aria-hidden="true" />;
}

function DeferredHeroScene() {
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      const idleId = idleWindow.requestIdleCallback(
        () => setCanRender(true),
        { timeout: 900 },
      );

      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(() => setCanRender(true), 300);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  if (!canRender) return <ScenePlaceholder />;

  return (
    <Suspense fallback={<ScenePlaceholder />}>
      <HeroScene />
    </Suspense>
  );
}

function Hero() {
  return (
    <div className="hero">
      <div className="hero__content">
        <p
          className="hero__eyebrow"
          data-hero-reveal
        >
          ANÁLISE, ESTRATÉGIA E DESENVOLVIMENTO
        </p>

        <h1
          className="hero__title"
          data-hero-reveal
        >
          Entenda o seu negócio.
          <br />
          <span>Transforme-o.</span>
        </h1>

        <p
          className="hero__description"
          data-hero-reveal
        >
          Analisamos seu negócio para identificar problemas e
          oportunidades e desenvolvemos sites e automações
          para transformar essas necessidades em soluções.
        </p>

        <div
          className="hero__actions"
          data-hero-reveal
        >
          <a
            className="hero__button hero__button--primary"
            href="#analise"
          >
            Análise Empresarial
          </a>

          <a
            className="hero__button hero__button--secondary"
            href="#desenvolvimento"
          >
            Desenvolvimento
          </a>
        </div>
      </div>

      <div
        className="hero__visual"
        data-hero-visual
      >
        <DeferredHeroScene />
      </div>
    </div>
  );
}

export default Hero;
