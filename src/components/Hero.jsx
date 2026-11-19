import { IMG, MOOD } from "../data/siteData.js";
import { Icon } from "./Icons.jsx";

export function Hero({ onOpenCalculator }) {
  return (
    <section
      className="hero"
      id="top"
      data-mobile-cta-trigger
      style={{
        "--hero-image": `url("${IMG.hero}")`,
        "--hero-image-mobile": `url("${IMG.heroMobile}")`,
      }}
    >
      <div className="hero-overlay" />
      <div className="hero-content">
        <span className="hero-kicker">ПРОСТІР ДЛЯ ВАЖЛИВИХ МОМЕНТІВ</span>
        <h1>БЕНКЕТИ У MOOD — ПРО ВАЖЛИВІ МОМЕНТИ</h1>
        <p>
          Ресторан MOOD — простір для зустрічей, відпочинку та спілкування.
          Розкажіть нам про вашу подію — обговоримо формат, меню та деталі
          святкування.
        </p>
        <div className="hero-actions">
          <button className="button button-yellow" onClick={onOpenCalculator}>
            Розрахувати вартість бенкету <Icon name="arrow" size={19} />
          </button>
          <a
            className="button button-glass"
            href={MOOD.menuUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Переглянути меню <Icon name="arrow" size={18} />
          </a>
        </div>
      </div>
      <a
        className="scroll-cue"
        href="#about"
        aria-label="Прокрутити до наступного розділу"
      >
        <span />
      </a>
    </section>
  );
}
