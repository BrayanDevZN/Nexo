import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function initScrollAnimations() {
  /*
   * =========================
   * HERO
   * =========================
   */

  const heroElements = document.querySelectorAll(
    "[data-hero-reveal]"
  );

  if (heroElements.length > 0) {
    gsap.fromTo(
      heroElements,
      {
        opacity: 0,
        y: 30,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.9,
        stagger: 0.12,
        ease: "power3.out",
        delay: 0.4,
      }
    );
  }

  /*
   * =========================
   * HERO — 3D
   * =========================
   */

  const heroVisual = document.querySelector(
    "[data-hero-visual]"
  );

  if (heroVisual) {
    gsap.fromTo(
      heroVisual,
      {
        opacity: 0,
        scale: 0.92,
      },
      {
        opacity: 1,
        scale: 1,
        duration: 1.2,
        ease: "power3.out",
        delay: 0.5,
      }
    );
  }

  /*
   * =========================
   * NAVBAR
   * =========================
   */

  const navbar = document.querySelector(
    "[data-navbar]"
  );

  if (navbar) {
    gsap.fromTo(
      navbar,
      {
        opacity: 0,
        y: -20,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: "power3.out",
        delay: 0.2,
      }
    );
  }

  /*
   * =========================
   * ELEMENTOS GENÉRICOS
   * =========================
   */

  const elements = document.querySelectorAll(
    "[data-scroll-reveal]"
  );

  elements.forEach((element) => {
    gsap.fromTo(
      element,
      {
        opacity: 0,
        y: 40,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: "power3.out",

        scrollTrigger: {
          trigger: element,
          start: "top 85%",
          toggleActions: "play reverse play reverse",
        },
      }
    );
  });

  /*
   * =========================
   * PROBLEM — CARDS
   * =========================
   */

  const problemCards = document.querySelectorAll(
    ".problem__card"
  );

  if (problemCards.length > 0) {
    gsap.fromTo(
      problemCards,
      {
        opacity: 0,
        y: 50,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",

        scrollTrigger: {
          trigger: ".problem__grid",
          start: "top 85%",
          toggleActions: "play reverse play reverse",
        },
      }
    );
  }

  /*
   * =========================
   * ANALYSIS
   * =========================
   */

  const analysis = document.querySelector(
    ".analysis"
  );

  if (analysis) {
    const header = analysis.querySelector(
      ".analysis__header"
    );

    if (header) {
      gsap.fromTo(
        header,
        {
          opacity: 0,
          y: 45,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",

          scrollTrigger: {
            trigger: analysis,
            start: "top 80%",
            toggleActions: "play reverse play reverse",
          },
        }
      );
    }

    const comparison = analysis.querySelector(
      ".comparison"
    );

    if (comparison) {
      gsap.fromTo(
        comparison,
        {
          opacity: 0,
          y: 60,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          delay: 0.1,
          ease: "power3.out",

          scrollTrigger: {
            trigger: comparison,
            start: "top 85%",
            toggleActions: "play reverse play reverse",
          },
        }
      );
    }

    const note = analysis.querySelector(
      ".analysis__note"
    );

    if (note) {
      gsap.fromTo(
        note,
        {
          opacity: 0,
          y: 30,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "power3.out",

          scrollTrigger: {
            trigger: note,
            start: "top 90%",
            toggleActions: "play reverse play reverse",
          },
        }
      );
    }
  }

  /*
   * =========================
   * DEVELOPMENT — HEADER
   * =========================
   */

  const development = document.querySelector(
    ".development"
  );

  if (development) {
    const header = development.querySelector(
      ".development__header"
    );

    if (header) {
      gsap.fromTo(
        header,
        {
          opacity: 0,
          y: 45,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",

          scrollTrigger: {
            trigger: development,
            start: "top 80%",
            toggleActions: "play reverse play reverse",
          },
        }
      );
    }
  }

  /*
   * =========================
   * DEVELOPMENT — CARDS
   * =========================
   */

  const developmentCards = document.querySelectorAll(
    ".development__card"
  );

  if (developmentCards.length > 0) {
    gsap.fromTo(
      developmentCards,
      {
        opacity: 0,
        y: 50,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        stagger: 0.18,
        ease: "power3.out",

        scrollTrigger: {
          trigger: ".development__services",
          start: "top 85%",
          toggleActions: "play reverse play reverse",
        },
      }
    );
  }

  /*
   * =========================
   * DEVELOPMENT — BOTTOM
   * =========================
   */

  const developmentBottom = document.querySelector(
    ".development__bottom"
  );

  if (developmentBottom) {
    gsap.fromTo(
      developmentBottom,
      {
        opacity: 0,
        y: 50,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: "power3.out",

        scrollTrigger: {
          trigger: developmentBottom,
          start: "top 85%",
          toggleActions: "play reverse play reverse",
        },
      }
    );
  }

  /*
   * =========================
   * DEVELOPMENT — MANUTENÇÃO
   * =========================
   */

  const maintenance = document.querySelector(
    ".development__maintenance"
  );

  if (maintenance) {
    gsap.fromTo(
      maintenance,
      {
        opacity: 0,
        y: 40,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: "power3.out",

        scrollTrigger: {
          trigger: maintenance,
          start: "top 90%",
          toggleActions: "play reverse play reverse",
        },
      }
    );
  }

  /*
   * =========================
   * CONTACT
   * =========================
   */

  const contact = document.querySelector(
    ".contact"
  );

  if (contact) {
    const content = contact.querySelector(
      ".contact__content"
    );

    if (content) {
      gsap.fromTo(
        content,
        {
          opacity: 0,
          y: 50,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: "power3.out",

          scrollTrigger: {
            trigger: contact,
            start: "top 80%",
            toggleActions: "play reverse play reverse",
          },
        }
      );
    }

    const bottom = contact.querySelector(
      ".contact__bottom"
    );

    if (bottom) {
      gsap.fromTo(
        bottom,
        {
          opacity: 0,
          y: 30,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          delay: 0.15,
          ease: "power3.out",

          scrollTrigger: {
            trigger: bottom,
            start: "top 90%",
            toggleActions: "play reverse play reverse",
          },
        }
      );
    }
  }

  
  ScrollTrigger.refresh();
}