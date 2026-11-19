import { benefits, events, IMG, MOOD, spaces } from "../data/siteData.js";
import { Icon } from "./Icons.jsx";

export function Benefits() {
  return (
    <section className="section benefits-section" id="about">
      <div className="section-heading centered">
        <span className="section-kicker">РЕСТОРАН MOOD</span>
        <h2>
          Простір смаку та <em>атмосфери</em>
        </h2>
        <p>
          Mood — сучасний ресторан у Дніпрі, на житловому масиві Перемога. Тут
          зустрічаються друзі та історії — за смачною кухнею, кавою, десертами,
          вином і коктейлями.
        </p>
      </div>
      <div className="benefit-grid">
        {benefits.map((item, i) => (
          <article className="benefit-card" key={item.title}>
            <div className="benefit-icon">
              <Icon name={item.icon} size={25} />
            </div>
            <span className="benefit-number">0{i + 1}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Spaces({ onOpenCalculator }) {
  return (
    <section className="section spaces-section" id="spaces">
      <div className="section-heading split-heading">
        <div>
          <span className="section-kicker">ЗУСТРІЧІ ТА СВЯТКУВАННЯ</span>
          <h2>
            Привід для зустрічі — <em>ваш</em>
          </h2>
        </div>
        <p>
          Опишіть подію та кількість гостей. Команда MOOD уточнить доступний
          формат, меню й організаційні умови.
        </p>
      </div>
      <div className="spaces-grid">
        {spaces.map((space, i) => (
          <article className="space-card" key={space.title}>
            <div className="space-photo">
              <img
                src={space.image}
                alt={space.title}
                loading="lazy"
                decoding="async"
              />
              <span className="photo-index">0{i + 1}</span>
            </div>
            <div className="space-copy">
              <h3>{space.title}</h3>
              <p>{space.subtitle}</p>
              <small>{space.note}</small>
            </div>
          </article>
        ))}
      </div>
      <div className="center-action">
        <button className="button button-dark" onClick={onOpenCalculator}>
          Підібрати простір <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
}

export function MenuSection({ onOpenCalculator }) {
  return (
    <section className="menu-section" id="menu">
      <div className="menu-image">
        <img
          src={IMG.food}
          alt="Страви для святкового столу"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="menu-copy">
        <span className="section-kicker">ГАСТРОНОМІЯ</span>
        <h2>
          Меню MOOD — <em>до вашого столу</em>
        </h2>
        <p>
          У ресторані — європейська кухня, сніданки до 15:00, кава, десерти,
          вино та коктейлі. Перегляньте актуальне меню, а формат частування для
          вашої події обговоріть із менеджером.
        </p>
        <div className="menu-tags">
          <span>Європейська кухня</span>
          <span>Кава</span>
          <span>Десерти</span>
          <span>Вино та коктейлі</span>
        </div>
        <div className="menu-actions">
          <a
            className="button button-yellow"
            href={MOOD.menuUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Переглянути меню <Icon name="arrow" />
          </a>
          <button
            className="button button-outline-light"
            onClick={onOpenCalculator}
          >
            Обговорити подію <Icon name="arrow" />
          </button>
        </div>
      </div>
    </section>
  );
}

export function Events() {
  return (
    <section className="section events-section" id="events">
      <div className="section-heading centered">
        <span className="section-kicker">ФОРМАТИ ПОДІЙ</span>
        <h2>
          Привід може бути <em>будь-яким</em>
        </h2>
        <p>
          Розкажіть, яке святкування плануєте. Команда MOOD уточнить, чи
          доступний потрібний формат і які умови можна запропонувати.
        </p>
      </div>
      <div className="events-grid">
        {events.map((item, i) => (
          <article className="event-card" key={item.title}>
            <img
              src={item.image}
              alt={item.title}
              loading="lazy"
              decoding="async"
            />
            <div className="event-overlay" />
            <div className="event-copy">
              <span>0{i + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Gallery() {
  const photos = IMG.gallery;
  const names = [
    "\u0411\u0435\u043d\u043a\u0435\u0442\u043d\u0435 \u0441\u0435\u0440\u0432\u0456\u0440\u0443\u0432\u0430\u043d\u043d\u044f",
    "\u0422\u0435\u0440\u0430\u0441\u0430 MOOD",
    "\u041c\u0443\u0437\u0438\u0447\u043d\u0456 \u0432\u0435\u0447\u043e\u0440\u0438",
    "\u0412\u0445\u0456\u0434 \u0434\u043e MOOD",
    "\u041f\u043e\u0434\u0430\u0447\u0430 \u043d\u0430\u043f\u043e\u0457\u0432",
  ];
  return (
    <section className="section gallery-section" id="gallery">
      <div className="section-heading split-heading">
        <div>
          <span className="section-kicker">ФОТОГАЛЕРЕЯ</span>
          <h2>
            Атмосфера у <em>кадрах</em>
          </h2>
        </div>
        <p>Ресторан, кухня та деталі MOOD — у світлинах із закладу.</p>
      </div>
      <div className="gallery-grid">
        {photos.map((src, i) => (
          <figure className={`gallery-photo gallery-photo-${i + 1}`} key={src}>
            <img src={src} alt={names[i]} loading="lazy" decoding="async" />
          </figure>
        ))}
      </div>
    </section>
  );
}
