import { MOOD } from "../data/siteData.js";
import { InstagramIcon } from "./Icons.jsx";

export function Footer() {
  return (
    <footer className="site-footer" data-mobile-cta-hide>
      <div className="footer-top">
        <a
          className="brand footer-brand"
          href="#top"
          aria-label="Ресторан MOOD — на головну"
        >
          <img
            className="brand-logo"
            src="/brand/mood-horizontal-cream-orange.png"
            alt="Ресторан MOOD"
          />
        </a>
        <nav>
          <a href="#about">Про MOOD</a>
          <a href="#spaces">Формати подій</a>
          <a href="#menu">Меню</a>
          <a href="#events">Події</a>
          <a href="#gallery">Галерея</a>
          <a href="#contact">Контакти</a>
        </nav>
        <div className="footer-contacts">
          <a href={`tel:${MOOD.phoneE164}`}>{MOOD.phoneDisplay}</a>
          <a href={MOOD.mapsUrl} target="_blank" rel="noopener noreferrer">
            {MOOD.address}
          </a>
          <span>{MOOD.hours}</span>
          <a
            className="instagram-link"
            href={MOOD.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram MOOD"
            title="Instagram MOOD"
          >
            <InstagramIcon size={19} />
          </a>
          <a href={MOOD.menuUrl} target="_blank" rel="noopener noreferrer">
            Меню ↗
          </a>
        </div>
        <a className="footer-up" href="#top">
          На початок ↑
        </a>
      </div>
      <div className="footer-bottom">
        <span>© 2026 · Ресторан MOOD</span>
        <span>Фото: ресторан MOOD</span>
      </div>
    </footer>
  );
}
