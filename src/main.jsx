import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Header } from "./components/Header.jsx";
import { Hero } from "./components/Hero.jsx";
import {
  Benefits,
  Events,
  Gallery,
  MenuSection,
  Spaces,
} from "./components/ContentSections.jsx";
import { FloatingContact } from "./components/FloatingContact.jsx";
import { Contact } from "./components/Contact.jsx";
import { Footer } from "./components/Footer.jsx";
import { Calculator } from "./components/Calculator.jsx";

function App() {
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [hasPassedHero, setHasPassedHero] = useState(false);
  const [isFooterVisible, setIsFooterVisible] = useState(false);
  const [isContactVisible, setIsContactVisible] = useState(false);

  const showMobileCalculator =
    hasPassedHero && !isContactVisible && !isFooterVisible;

  useEffect(() => {
    const hero = document.querySelector("[data-mobile-cta-trigger]");
    const footer = document.querySelector("[data-mobile-cta-hide]");
    const contact = document.querySelector("#contact");

    if (!hero) return undefined;

    const heroObserver = new IntersectionObserver(([entry]) => {
      setHasPassedHero(
        !entry.isIntersecting && entry.boundingClientRect.top < 0,
      );
    });

    heroObserver.observe(hero);

    let footerObserver;
    let contactObserver;

    if (contact) {
      contactObserver = new IntersectionObserver(
        ([entry]) => {
          setIsContactVisible(entry.isIntersecting);
        },
        {
          threshold: 0,
          rootMargin: "0px 0px -10% 0px",
        },
      );

      contactObserver.observe(contact);
    }

    if (footer) {
      footerObserver = new IntersectionObserver(
        ([entry]) => {
          setIsFooterVisible(entry.isIntersecting);
        },
        {
          threshold: 0,
          rootMargin: "0px 0px -40px 0px",
        },
      );

      footerObserver.observe(footer);
    }

    return () => {
      heroObserver.disconnect();
      contactObserver?.disconnect();
      footerObserver?.disconnect();
    };
  }, []);

  const openCalculatorFromMobileCta = (event) => {
    event.preventDefault();
    setCalculatorOpen(true);
  };

  return (
    <>
      <Header onOpenCalculator={() => setCalculatorOpen(true)} />
      <main>
        <Hero onOpenCalculator={() => setCalculatorOpen(true)} />
        <Benefits />
        <Spaces onOpenCalculator={() => setCalculatorOpen(true)} />
        <MenuSection onOpenCalculator={() => setCalculatorOpen(true)} />
        <Events />
        <Gallery />
        <Contact />
      </main>
      <Footer />
      <FloatingContact mobileVisible={showMobileCalculator} />
      <a
        className={`mobile-calculator-cta ${showMobileCalculator ? "is-visible" : ""}`}
        href="#calculator"
        onClick={openCalculatorFromMobileCta}
        aria-hidden={!showMobileCalculator}
        tabIndex={showMobileCalculator ? 0 : -1}
      >
        Розрахувати вартість бенкету
      </a>
      <Calculator
        open={calculatorOpen}
        onClose={() => setCalculatorOpen(false)}
      />
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
