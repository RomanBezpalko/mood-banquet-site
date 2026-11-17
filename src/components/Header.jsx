import { useState } from "react";
import { MOOD } from "../data/siteData.js";
import { Icon, InstagramIcon } from "./Icons.jsx";

export function Header({ onOpenCalculator }) {
  const [open, setOpen] = useState(false);
  const links = [
    ["Про нас", "#about"],
    ["Меню", "#menu"],
    ["Бенкети", "#spaces"],
    ["Події", "#events"],
    ["Фотогалерея", "#gallery"],
    ["Контакти", "#contact"],
  ];
  const closeMenu = () => setOpen(false);

  return (
    <header className="site-header">
      <a
        className="brand"
        href="#top"
        onClick={closeMenu}
        aria-label="Ресторан MOOD — на головну"
      >
        <img
          className="brand-logo"
          src="/brand/mood-horizontal-cream-orange.png"
          alt="Ресторан MOOD"
        />
      </a>
      <nav
        id="main-navigation"
        className={open ? "main-nav is-open" : "main-nav"}
        aria-label="Головна навігація"
      >
        {links.map(([label, href]) => (
          <a key={href} href={href} onClick={closeMenu}>
            {label}
          </a>
        ))}
        <button
          className="mobile-nav-cta"
          onClick={() => {
            closeMenu();
            onOpenCalculator();
          }}
        >
          Розрахувати вартість бенкету
        </button>
      </nav>
      <div className="header-right">
        <a
          className="social-dot instagram-dot"
          href={MOOD.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram MOOD"
        >
          <InstagramIcon size={13} />
        </a>
        <button className="header-booking" onClick={onOpenCalculator}>
          Запитати про вільну дату
        </button>
      </div>
      <button
        className="menu-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="main-navigation"
        aria-label={open ? "Закрити меню" : "Відкрити меню"}
      >
        <Icon name={open ? "close" : "menu"} size={24} />
      </button>
    </header>
  );
}
