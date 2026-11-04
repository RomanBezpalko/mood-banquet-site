import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { formatUaPhone, sanitizeUaPhoneDigits, toUaE164 } from '../shared/ua-phone.js';

// Тимчасові фото з Unsplash. Перед публікацією їх можна замінити на фото конкретного закладу.
const IMG = {
  hero: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=2200&q=88',
  hall: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=85',
  intimate: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=85',
  food: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=85',
  wedding: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=85',
  event: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=85',
  party: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1200&q=85'
};

const MOOD = {
  phoneDisplay: '+38 (097) 935-17-46',
  phoneE164: '+380979351746',
  address: 'Дніпро, вул. Набережна Перемоги, 128',
  hours: 'Щодня: 09:00–22:00',
  menuUrl: 'https://expz.menu/52b4c563-f3dd-4fb2-89b6-f556135d32a3',
  instagramUrl: 'https://www.instagram.com/mood.restaurant.dnipro/',
  viberUrl: 'https://viber.me/380979351746',
  telegramUrl: 'https://t.me/+380979351746',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=MOOD+restaurant+Naberezhna+Peremohy+128+Dnipro'
};

function Icon({ name, size = 20 }) {
  const paths = {
    arrow: <><path d="M4 12h15"/><path d="m13 5 7 7-7 7"/></>,
    menu: <><path d="M3 7h18M3 12h18M3 17h18"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    minus: <path d="M5 12h14"/>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/>,
    sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 15 1.1 2.1L22 18l-1.9.9L19 21l-1.1-2.1L16 18l1.9-.9L19 15Z"/></>,
    music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
    plate: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M2 12h1M21 12h1M12 2v1M12 21v1"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3 20c.5-3.2 2.5-5 6-5s5.5 1.8 6 5"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17 15c2.3.4 3.6 2 4 5"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function InstagramIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
    <circle cx="17.5" cy="6.8" r="1.2" fill="currentColor"/>
  </svg>;
}

function Header({ onOpenCalculator }) {
  const [open, setOpen] = useState(false);
  const links = [['Про нас', '#about'], ['Меню', '#menu'], ['Банкети', '#spaces'], ['Події', '#events'], ['Фотогалерея', '#gallery'], ['Контакти', '#contact']];
  const closeMenu = () => setOpen(false);
  return <header className="site-header">
    <a className="brand" href="#top" onClick={closeMenu} aria-label="MOOD restaurant — на головну"><img className="brand-logo" src="/brand/mood-horizontal-cream-orange.png" alt="MOOD restaurant" /></a>
    <nav className={open ? 'main-nav is-open' : 'main-nav'} aria-label="Головна навігація">
      {links.map(([label, href]) => <a key={href} href={href} onClick={closeMenu}>{label}</a>)}
      <button className="mobile-nav-cta" onClick={() => { closeMenu(); onOpenCalculator(); }}>Розрахувати банкет</button>
    </nav>
    <div className="header-right"><a className="social-dot instagram-dot" href={MOOD.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram MOOD"><InstagramIcon size={13}/></a><button className="header-booking" onClick={onOpenCalculator}>Запитати дату</button></div>
    <button className="menu-toggle" onClick={() => setOpen(v => !v)} aria-label={open ? 'Закрити меню' : 'Відкрити меню'}><Icon name={open ? 'close' : 'menu'} size={24}/></button>
  </header>;
}

function Hero({ onOpenCalculator }) {
  return <section className="hero" id="top" data-mobile-cta-trigger style={{ '--hero-image': `url("${IMG.hero}")` }}>
    <div className="hero-overlay" />
    <div className="hero-content">
      <span className="hero-kicker">ПРОСТІР ДЛЯ ВАЖЛИВИХ МОМЕНТІВ</span>
      <h1>БЕНКЕТИ У MOOD — ПРО ВАЖЛИВІ МОМЕНТИ</h1>
      <p>MOOD restaurant — простір для зустрічей, відпочинку та спілкування. Розкажіть нам про вашу подію — обговоримо формат, меню та деталі святкування.</p>
      <div className="hero-actions">
        <button className="button button-yellow" onClick={onOpenCalculator}>Розрахувати вартість бенкету <Icon name="arrow" size={19}/></button>
        <a className="button button-glass" href={MOOD.menuUrl} target="_blank" rel="noopener noreferrer">Переглянути меню <Icon name="arrow" size={18}/></a>
      </div>
    </div>
    <a className="scroll-cue" href="#about" aria-label="Прокрутити до наступного розділу"><span /></a>
  </section>;
}

const benefits = [
  { icon: 'plate', title: 'Європейська кухня', text: 'У MOOD можна насолодитися стравами європейської кухні.' },
  { icon: 'sparkle', title: 'Сніданки до 15:00', text: 'Починайте день у своєму ритмі — сніданки подаємо до 15:00.' },
  { icon: 'people', title: 'Кава та фільтр-кава', text: 'Каву можна замовити в закладі або взяти із собою.' },
  { icon: 'music', title: 'Музичні вечори', text: 'Атмосферу вечорів доповнюють музичні виступи під звуки фортепіано.' },
  { icon: 'sparkle', title: 'Вино, коктейлі та десерти', text: 'Доповніть зустріч улюбленим напоєм і десертом.' },
  { icon: 'people', title: 'Простір для зустрічей', text: 'Місце для відпочинку, роботи, спілкування та зустрічей із друзями.' }
];

function Benefits() {
  return <section className="section benefits-section" id="about">
    <div className="section-heading centered"><span className="section-kicker">MOOD RESTAURANT</span><h2>Простір смаку та <em>атмосфери</em></h2><p>Mood — сучасний ресторан у Дніпрі, на житловому масиві Перемога. Тут зустрічаються друзі та історії — за смачною кухнею, кавою, десертами, вином і коктейлями.</p></div>
    <div className="benefit-grid">{benefits.map((item, i) => <article className="benefit-card" key={item.title}><div className="benefit-icon"><Icon name={item.icon} size={25}/></div><span className="benefit-number">0{i + 1}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
  </section>;
}

const spaces = [
  { title: 'Сімейне святкування', subtitle: 'Тепла зустріч із близькими та нагода побути разом', image: "/images/mood-refresh/space-banquet.jpg", note: 'Формат і можливості узгоджуються з менеджером' },
  { title: 'Зустріч із друзями', subtitle: 'Невимушене спілкування, європейська кухня та напої', image: IMG.intimate, note: 'Деталі бронювання уточнюйте в ресторані' },
  { title: 'Подія у вашому форматі', subtitle: 'Розкажіть, що плануєте — обговоримо можливості MOOD', image: "/images/mood-refresh/food-main.jpg", note: 'Умови та доступність — за погодженням' }
];

function Spaces({ onOpenCalculator }) {
  return <section className="section spaces-section" id="spaces">
    <div className="section-heading split-heading"><div><span className="section-kicker">ЗУСТРІЧІ ТА СВЯТКУВАННЯ</span><h2>Привід для зустрічі — <em>ваш</em></h2></div><p>Опишіть подію та кількість гостей. Команда MOOD уточнить доступний формат, меню й організаційні умови.</p></div>
    <div className="spaces-grid">{spaces.map((space, i) => <article className="space-card" key={space.title}><div className="space-photo"><img src={space.image} alt={space.title}/><span className="photo-index">0{i + 1}</span></div><div className="space-copy"><h3>{space.title}</h3><p>{space.subtitle}</p><small>{space.note}</small></div></article>)}</div>
    <div className="center-action"><button className="button button-dark" onClick={onOpenCalculator}>Підібрати простір <Icon name="arrow"/></button></div>
  </section>;
}

function MenuSection({ onOpenCalculator }) {
  return <section className="menu-section" id="menu">
    <div className="menu-image"><img src={"/images/mood-refresh/food-main.jpg"} alt="Страви для святкового столу"/></div>
    <div className="menu-copy"><span className="section-kicker">ГАСТРОНОМІЯ</span><h2>Меню MOOD — <em>до вашого столу</em></h2><p>У ресторані — європейська кухня, сніданки до 15:00, кава, десерти, вино та коктейлі. Перегляньте актуальне меню, а формат частування для вашої події обговоріть із менеджером.</p><div className="menu-tags"><span>Європейська кухня</span><span>Кава</span><span>Десерти</span><span>Вино та коктейлі</span></div><div className="menu-actions"><a className="button button-yellow" href={MOOD.menuUrl} target="_blank" rel="noreferrer">Переглянути меню <Icon name="arrow"/></a><button className="button button-outline-light" onClick={onOpenCalculator}>Обговорити подію <Icon name="arrow"/></button></div></div>
  </section>;
}

const events = [
  { title: 'Весілля', desc: 'День, у якому важлива кожна мить.', image: "/images/mood-refresh/event-romantic.png" },
  { title: 'Дні народження та ювілеї', desc: 'Тепла зустріч із найближчими людьми.', image: IMG.party },
  { title: 'Корпоративи', desc: 'Святкування, що об’єднує команду.', image: IMG.event },
  { title: 'Конференції та презентації', desc: 'Ділові події з продуманою організацією.', image: IMG.intimate }
];

function Events() {
  return <section className="section events-section" id="events"><div className="section-heading centered"><span className="section-kicker">ФОРМАТИ ПОДІЙ</span><h2>Привід може бути <em>будь-яким</em></h2><p>Розкажіть, яке святкування плануєте. Команда MOOD уточнить, чи доступний потрібний формат і які умови можна запропонувати.</p></div><div className="events-grid">{events.map((item, i) => <article className="event-card" key={item.title}><img src={item.image} alt={item.title}/><div className="event-overlay"/><div className="event-copy"><span>0{i + 1}</span><h3>{item.title}</h3><p>{item.desc}</p></div></article>)}</div></section>;
}

function Gallery() {
  const photos = ["/images/mood-refresh/gallery-banquet.jpg", "/images/mood-refresh/gallery-terrace.jpg", "/images/mood-refresh/gallery-piano.jpg", "/images/mood-refresh/gallery-brand-detail.jpg", "/images/mood-refresh/gallery-cocktails.jpg"];
  const names = ['Банкетна зала', 'Весільне оформлення', 'Святкове меню', 'Події та зустрічі', 'Сервірування столу'];
  return <section className="section gallery-section" id="gallery"><div className="section-heading split-heading"><div><span className="section-kicker">ФОТОГАЛЕРЕЯ</span><h2>Атмосфера у <em>кадрах</em></h2></div><p>Ресторан, кухня та деталі MOOD — у світлинах із закладу.</p></div><div className="gallery-grid">{photos.map((src, i) => <figure className={`gallery-photo gallery-photo-${i + 1}`} key={src}><img src={src} alt={names[i]}/></figure>)}</div></section>;
}

const defaultContact = { name: '', phone: '', date: '', guests: 40, format: 'Весілля', menu: 'banquet', extras: [], comment: '' };

function UaPhoneField({ id, value, onChange, label = 'Номер телефону' }) {
  const [touched, setTouched] = useState(false);
  const isComplete = value.length === 9;
  return <div className="ua-phone-field">
    <label htmlFor={id}>{label}</label>
    <div className={`ua-phone-control ${touched && !isComplete ? 'is-invalid' : ''}`}>
      <span className="ua-phone-prefix" aria-hidden="true">+380</span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={value}
        required
        minLength={9}
        maxLength={32}
        pattern="[0-9]{9}"
        aria-label={`${label}, код країни +380`}
        aria-invalid={touched && !isComplete}
        aria-describedby={`${id}-hint`}
        placeholder="XX XXX XX XX"
        onBlur={() => setTouched(true)}
        onChange={event => onChange(sanitizeUaPhoneDigits(event.target.value))}
      />
    </div>
    <small id={`${id}-hint`} className={`ua-phone-hint ${touched && !isComplete ? 'is-invalid' : ''}`}>
      {touched && !isComplete ? `Введіть ще ${9 - value.length} ${9 - value.length === 1 ? 'цифру' : 'цифр'} після +380.` : 'Код країни +380 вже встановлено. Введіть 9 цифр номера.'}
    </small>
  </div>;
}

let csrfTokenPromise;

async function getCsrfToken(forceRefresh = false) {
  if (forceRefresh) csrfTokenPromise = null;
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch('/api/csrf')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Не вдалося отримати токен безпеки.')))
      .then(body => body.token);
  }
  return csrfTokenPromise;
}

async function sendLead(payload) {
  let csrfToken = await getCsrfToken();
  let response = await fetch('/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(payload)
  });
  let result = await response.json().catch(() => ({}));

  if (response.status === 403 && result.message === 'Недійсний токен безпеки.') {
    csrfToken = await getCsrfToken(true);
    response = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(payload)
    });
    result = await response.json().catch(() => ({}));
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.message || 'Не вдалося надіслати заявку. Спробуйте ще раз або зателефонуйте до ресторану.');
  }
  return result;
}
const menus = [
  { id: 'european', title: 'Меню ресторану MOOD', detail: 'Європейська кухня — переглянути актуальне меню' },
  { id: 'banquet', title: 'Банкетний формат', detail: 'Склад і формат частування узгоджуються індивідуально' },
  { id: 'buffet', title: 'Фуршет / легкий формат', detail: 'Можливість і умови потрібно погодити з менеджером' }
];
const extraOptions = ['Власні напої', 'Декорування зали', 'Звукове обладнання', 'Музичний гурт або DJ', 'Караоке', 'Фотозона', 'Фотограф', 'Ведучий'];

function Calculator({ open, onClose }) {
  const [data, setData] = useState(defaultContact);
  const [website, setWebsite] = useState('');
  const [formStartedAt, setFormStartedAt] = useState(() => Date.now());
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const dialogRef = useRef(null);
  const contactIsValid = data.name.trim().length >= 2 && data.phone.length === 9;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    dialogRef.current?.querySelector('button, input')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose]);

  useEffect(() => { if (open) { setData(defaultContact); setWebsite(''); setFormStartedAt(Date.now()); setStep(0); setSubmitted(false); setSending(false); setSubmitError(''); } }, [open]);
  if (!open) return null;

  const update = (key, value) => setData(prev => ({ ...prev, [key]: value }));
  const toggleExtra = label => update('extras', data.extras.includes(label) ? data.extras.filter(x => x !== label) : [...data.extras, label]);
  const steps = ['Подія та дата', 'Меню та бюджет', 'Додаткові опції', 'Контактні дані', 'Підтвердження'];
  const next = () => {
    if (step === 3 && !contactIsValid) {
      setSubmitError(data.name.trim().length < 2
        ? 'Вкажіть ім’я (не менше 2 символів).'
        : 'Введіть повний номер телефону: рівно 9 цифр після +380.');
      return;
    }
    setSubmitError('');
    setStep(s => Math.min(4, s + 1));
  };
  const previous = () => setStep(s => Math.max(0, s - 1));
  const submitCalculatorLead = async () => {
    setSending(true);
    setSubmitError('');
    try {
      await sendLead({
        source: 'Калькулятор бенкету',
        name: data.name.trim(), phone: toUaE164(data.phone), eventDate: data.date,
        guests: data.guests, eventFormat: data.format,
        menu: menus.find(m => m.id === data.menu)?.title || data.menu,
        extras: data.extras, comment: data.comment, website, formStartedAt
      });
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error.message || 'Не вдалося надіслати заявку. Спробуйте ще раз.');
    } finally {
      setSending(false);
    }
  };

  return createPortal(<div className="calculator-modal" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={dialogRef} id="calculator" className="calculator-dialog" role="dialog" aria-modal="true" aria-labelledby="calculator-title">
      <button className="modal-close" type="button" onClick={onClose} aria-label="Закрити калькулятор"><Icon name="close"/></button>
      <div className="calculator-intro"><span className="section-kicker">ПОПЕРЕДНІЙ РОЗРАХУНОК</span><h2 id="calculator-title">Плануємо ваше <em>свято</em></h2><p>Заповніть кілька кроків, щоб передати менеджеру параметри вашої події та отримати персональну пропозицію.</p><div className="calculator-tip">Деталі, меню та вартість узгоджуються з командою MOOD.</div></div>
      <div className="calculator-body">
        <input className="bot-trap" tabIndex="-1" autoComplete="off" aria-hidden="true" value={website} onChange={e => setWebsite(e.target.value)} />
        <div className="calc-progress"><div className="progress-caption"><span>КРОК {step + 1} ІЗ 5</span><span>{steps[step]}</span></div><div className="progress-track"><span style={{ width: `${(step + 1) * 20}%` }}/></div></div>
        {submitted ? <div className="calc-success"><span className="success-mark"><Icon name="check" size={26}/></span><h3>Запит сформовано</h3><p>Дякуємо! Заявку надіслано команді MOOD у Telegram. Менеджер зв’яжеться з вами для уточнення деталей.</p><button className="button button-dark" onClick={onClose}>Закрити</button></div> : <>
          {step === 0 && <div className="calc-step"><h3>Розкажіть про вашу подію</h3><div className="form-grid"><label>Формат заходу<select value={data.format} onChange={e => update('format', e.target.value)}><option>Весілля</option><option>Корпоратив</option><option>День народження</option><option>Фуршет</option><option>Конференція / презентація</option><option>Інше</option></select></label><label>Дата заходу<input type="date" min={new Date().toISOString().slice(0, 10)} value={data.date} onChange={e => update('date', e.target.value)}/></label></div><div className="guest-control"><div><b>Орієнтовна кількість гостей</b><small>Вкажіть від 10 до 200 осіб</small></div><div className="counter"><button type="button" onClick={() => update('guests', Math.max(10, data.guests - 5))}><Icon name="minus"/></button><strong>{data.guests}</strong><button type="button" onClick={() => update('guests', Math.min(200, data.guests + 5))}><Icon name="plus"/></button></div></div></div>}
          {step === 1 && <div className="calc-step"><h3>Оберіть бажаний формат меню</h3><p className="step-hint">Актуальне меню ресторану відкривається окремо. Умови банкетного частування узгоджуються з менеджером.</p><div className="menu-options">{menus.map(menu => <button type="button" key={menu.id} className={data.menu === menu.id ? 'menu-option selected' : 'menu-option'} onClick={() => update('menu', menu.id)}><span className="radio-dot"/><span className="menu-option-copy"><b>{menu.title}</b><small>{menu.detail}</small></span><span className="option-arrow">›</span></button>)}</div></div>}
          {step === 2 && <div className="calc-step"><h3>Додаткові побажання</h3><p className="step-hint">Позначте побажання, можливість реалізації яких потрібно узгодити з менеджером.</p><div className="extra-grid">{extraOptions.map(item => <button type="button" key={item} className={data.extras.includes(item) ? 'extra-option selected' : 'extra-option'} onClick={() => toggleExtra(item)}><span className="check-box">{data.extras.includes(item) && <Icon name="check" size={14}/>}</span>{item}</button>)}</div></div>}
          {step === 3 && <div className="calc-step"><h3>Залиште контактні дані</h3><div className="form-grid"><label>Ваше ім’я<input required minLength={2} maxLength={80} autoComplete="name" value={data.name} onChange={e => { update('name', e.target.value); setSubmitError(''); }} onBlur={() => update('name', data.name.trim())} placeholder="Як до вас звертатися"/></label><UaPhoneField id="calculator-phone" value={data.phone} onChange={value => { update('phone', value); setSubmitError(''); }} /></div><label className="full-label">Коментар або побажання<textarea rows="3" value={data.comment} onChange={e => update('comment', e.target.value)} placeholder="Розкажіть трохи більше про ваше свято"/></label></div>}
          {step === 4 && <div className="calc-step"><h3>Перевірте ваш запит</h3><div className="summary-list"><div><span>Формат</span><b>{data.format}</b></div><div><span>Дата</span><b>{data.date || 'Ще не визначена'}</b></div><div><span>Кількість гостей</span><b>{data.guests}</b></div><div><span>Меню</span><b>{menus.find(m => m.id === data.menu)?.title}</b></div><div><span>Додаткові опції</span><b>{data.extras.length ? data.extras.join(', ') : 'Не обрано'}</b></div><div><span>Контакт</span><b>{data.name.trim()} · {formatUaPhone(data.phone)}</b></div></div><div className="budget-estimate"><span>Вартість події</span><strong>Уточнюється індивідуально</strong><small>Ціни банкетного меню та додаткових послуг ще не надані. Менеджер MOOD зможе підготувати розрахунок після уточнення деталей.</small><a href={MOOD.menuUrl} target="_blank" rel="noreferrer">Переглянути меню ресторану →</a></div></div>}
          {submitError && <p className="form-error" role="alert">{submitError}</p>}
          <div className="calc-actions">{step > 0 ? <button type="button" className="back-button" onClick={previous}>← Назад</button> : <span/>}{step < 4 ? <button type="button" className="button button-dark" onClick={next}>Далі <Icon name="arrow"/></button> : <button type="button" className="button button-dark" disabled={!contactIsValid || sending} onClick={submitCalculatorLead}>{sending ? 'Надсилаємо…' : 'Надіслати заявку'} <Icon name="arrow"/></button>}</div>
        </>}
      </div>
    </section>
  </div>, document.body);
}

function FloatingContact() {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = event => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  return <>
    {expanded && <button className="contact-backdrop" type="button" aria-label="Закрити способи зв’язку" onClick={() => setExpanded(false)}/>}
    <div className={`floating-contact ${expanded ? 'is-open' : ''}`}>
      {expanded ? <div className="contact-methods" aria-label="Способи зв’язку">
        <a className="contact-method phone-method" href={`tel:${MOOD.phoneE164}`}>
          <span>Зателефонувати {MOOD.phoneDisplay}</span><b><Icon name="phone" size={22}/></b>
        </a>
        <a className="contact-method viber-method" href={MOOD.viberUrl} target="_blank" rel="noreferrer">
          <span>Написати у Viber</span><b><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12.1 2C6.4 2 2 5.8 2 10.8c0 2.1.8 4 2.2 5.5L3.5 22l5.7-2.1c.9.3 1.9.5 2.9.5 5.7 0 10-3.8 10-9.1S17.8 2 12.1 2Zm0 16.4c-.9 0-1.8-.2-2.6-.5l-.5-.2-3.1 1.1.7-3-.4-.5c-1.2-1.2-1.8-2.7-1.8-4.4 0-3.9 3.4-7 7.7-7s7.7 3.1 7.7 7-3.4 7.5-7.7 7.5Zm4.2-5.1c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8.9-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.3.1-.4l.4-.5c.1-.1.1-.2.2-.4.1-.1 0-.3 0-.4-.1-.1-.5-1.3-.7-1.7-.2-.4-.4-.4-.5-.4h-.4c-.1 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.4 2.3.9 2.3.6 2.7.6.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.3-.2-.5-.3Z"/></svg></b>
        </a>
        <a className="contact-method telegram-method" href={MOOD.telegramUrl} target="_blank" rel="noreferrer">
          <span>Написати у Telegram</span><b><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M21.8 4.3 18.6 20c-.2 1.1-.8 1.4-1.7.9l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.4-.1-.6-.6-.2L6.5 14l-4.7-1.5c-1-.3-1-1 .2-1.5L20.4 3.4c.9-.3 1.7.2 1.4.9Z"/></svg></b>
        </a>
        <button className="contact-method-close" type="button" onClick={() => setExpanded(false)} aria-label="Закрити меню зв’язку"><Icon name="close" size={25}/></button>
      </div> : <button className="contact-trigger" type="button" onClick={() => setExpanded(true)} aria-expanded="false" aria-label="Зв’язок — відкрити способи зв’язку">
        <span>Зв’язок</span><b><Icon name="phone" size={22}/></b>
      </button>}
    </div>
  </>;
}

function Contact() {
  const [form, setForm] = useState({ name: '', phone: '' });
  const [website, setWebsite] = useState('');
  const [formStartedAt, setFormStartedAt] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const submitCallback = async event => {
    event.preventDefault();
    if (form.name.trim().length < 2 || form.phone.length !== 9) {
      setErrorMessage(form.name.trim().length < 2 ? 'Вкажіть ім’я (не менше 2 символів).' : 'Введіть повний номер телефону: рівно 9 цифр після +380.');
      return;
    }
    setSending(true);
    setErrorMessage('');
    try {
      await sendLead({ source: 'Форма зворотного дзвінка', name: form.name.trim(), phone: toUaE164(form.phone), website, formStartedAt });
      setDone(true);
    } catch (error) {
      setErrorMessage(error.message || 'Не вдалося надіслати заявку. Спробуйте ще раз.');
    } finally {
      setSending(false);
    }
  };
  return <section className="contact-section" id="contact"><div className="contact-content"><div className="contact-copy"><span className="section-kicker">MOOD RESTAURANT · ДНІПРО</span><h2>Зустрінемось у <em>MOOD</em></h2><p>Тут зустрічаються друзі та історії. Зателефонуйте нам або залиште контакти, щоб обговорити вашу подію.</p><a href={`tel:${MOOD.phoneE164}`} className="contact-phone"><Icon name="phone"/> {MOOD.phoneDisplay}</a><a className="contact-address" href={MOOD.mapsUrl} target="_blank" rel="noreferrer"><Icon name="pin"/> {MOOD.address}</a><div className="contact-detail"><span className="contact-detail-label">ГРАФІК РОБОТИ</span><strong>{MOOD.hours}</strong></div><div className="contact-links"><a href={MOOD.menuUrl} target="_blank" rel="noreferrer">Меню ресторану ↗</a><a className="instagram-link" href={MOOD.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram MOOD" title="Instagram MOOD"><InstagramIcon size={19}/></a></div></div><form className="callback-form" onSubmit={submitCallback}>
    {done ? <div className="callback-success"><span><Icon name="check"/></span><h3>Дякуємо за звернення!</h3><p>Заявку на зворотний дзвінок надіслано команді MOOD у Telegram. Ми зв’яжемося з вами.</p><button type="button" className="back-button" onClick={() => { setDone(false); setForm({ name: '', phone: '' }); }}>Надіслати ще раз</button></div> : <><h3>Замовити дзвінок</h3><p>Заповніть коротку форму</p><label>Ваше ім’я<input required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={e => { update('name', e.target.value); setErrorMessage(''); }} onBlur={() => update('name', form.name.trim())} placeholder="Ваше ім’я"/></label><UaPhoneField id="callback-phone" value={form.phone} onChange={value => { update('phone', value); setErrorMessage(''); }} />{errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}<button type="submit" className="button button-yellow" disabled={sending || form.name.trim().length < 2 || form.phone.length !== 9}>{sending ? 'Надсилаємо…' : 'Замовити дзвінок'} <Icon name="arrow"/></button><small>Натискаючи кнопку, ви погоджуєтеся на обробку персональних даних.</small></>}
  </form></div></section>;
}
function Footer() {
  return <footer className="site-footer" data-mobile-cta-hide><div className="footer-top"><a className="brand footer-brand" href="#top" aria-label="MOOD restaurant — на головну"><img className="brand-logo" src="/brand/mood-horizontal-cream-orange.png" alt="MOOD restaurant" /></a><nav><a href="#about">Про MOOD</a><a href="#spaces">Формати подій</a><a href="#menu">Меню</a><a href="#events">Події</a><a href="#gallery">Галерея</a><a href="#contact">Контакти</a></nav><div className="footer-contacts"><a href={`tel:${MOOD.phoneE164}`}>{MOOD.phoneDisplay}</a><a href={MOOD.mapsUrl} target="_blank" rel="noreferrer">{MOOD.address}</a><span>{MOOD.hours}</span><a className="instagram-link" href={MOOD.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram MOOD" title="Instagram MOOD"><InstagramIcon size={19}/></a><a href={MOOD.menuUrl} target="_blank" rel="noreferrer">Меню ↗</a></div><a className="footer-up" href="#top">Нагору ↑</a></div><div className="footer-bottom"><span>© 2026 · MOOD restaurant</span><span>Фото: MOOD restaurant</span></div></footer>;
}

function App() {
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [hasPassedHero, setHasPassedHero] = useState(false);
  const [isFooterVisible, setIsFooterVisible] = useState(false);

  const showMobileCalculator = hasPassedHero && !isFooterVisible;

  useEffect(() => {
    const hero = document.querySelector('[data-mobile-cta-trigger]');
    const footer = document.querySelector('[data-mobile-cta-hide]');

    if (!hero) return undefined;

    const heroObserver = new IntersectionObserver(([entry]) => {
      setHasPassedHero(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });

    heroObserver.observe(hero);

    let footerObserver;

    if (footer) {
      footerObserver = new IntersectionObserver(([entry]) => {
        setIsFooterVisible(entry.isIntersecting);
      }, {
        threshold: 0,
        rootMargin: '0px 0px -40px 0px'
      });

      footerObserver.observe(footer);
    }

    return () => {
      heroObserver.disconnect();
      footerObserver?.disconnect();
    };
  }, []);

  const openCalculatorFromMobileCta = event => {
    event.preventDefault();
    setCalculatorOpen(true);
  };

  return <><Header onOpenCalculator={() => setCalculatorOpen(true)}/><main><Hero onOpenCalculator={() => setCalculatorOpen(true)}/><Benefits/><Spaces onOpenCalculator={() => setCalculatorOpen(true)}/><MenuSection onOpenCalculator={() => setCalculatorOpen(true)}/><Events/><Gallery/><Contact/></main><Footer/><FloatingContact/><a className={`mobile-calculator-cta ${showMobileCalculator ? 'is-visible' : ''}`} href="#calculator" onClick={openCalculatorFromMobileCta} aria-hidden={!showMobileCalculator} tabIndex={showMobileCalculator ? 0 : -1}>Розрахувати бенкет</a><Calculator open={calculatorOpen} onClose={() => setCalculatorOpen(false)}/></>;
}

createRoot(document.getElementById('root')).render(<App/>);
