export const IMG = {
  hero: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=2200&q=88",
  intimate:
    "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=85",
  event:
    "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=85",
  party:
    "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1200&q=85",
};

export const MOOD = {
  phoneDisplay: "+38 (097) 935-17-46",
  phoneE164: "+380979351746",
  address: "Дніпро, вул. Набережна Перемоги, 128",
  hours: "Щодня: 09:00–22:00",
  menuUrl: "https://expz.menu/52b4c563-f3dd-4fb2-89b6-f556135d32a3",
  instagramUrl: "https://www.instagram.com/mood.restaurant.dnipro/",
  viberUrl: "https://viber.me/380979351746",
  telegramUrl: "https://t.me/+380979351746",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=MOOD+restaurant+Naberezhna+Peremohy+128+Dnipro",
};

export const benefits = [
  {
    icon: "plate",
    title: "Європейська кухня",
    text: "У MOOD можна насолодитися стравами європейської кухні.",
  },
  {
    icon: "sparkle",
    title: "Сніданки до 15:00",
    text: "Починайте день у своєму ритмі — сніданки подаємо до 15:00.",
  },
  {
    icon: "people",
    title: "Кава та фільтр-кава",
    text: "Каву можна замовити в закладі або взяти із собою.",
  },
  {
    icon: "music",
    title: "Музичні вечори",
    text: "Атмосферу вечорів доповнюють музичні виступи під звуки фортепіано.",
  },
  {
    icon: "sparkle",
    title: "Вино, коктейлі та десерти",
    text: "Доповніть зустріч улюбленим напоєм і десертом.",
  },
  {
    icon: "people",
    title: "Простір для зустрічей",
    text: "Місце для відпочинку, роботи, спілкування та зустрічей із друзями.",
  },
];

export const spaces = [
  {
    title: "Сімейне святкування",
    subtitle: "Тепла зустріч із близькими та нагода побути разом",
    image: "/images/mood-refresh/space-banquet.jpg",
    note: "Формат і можливості узгоджуються з менеджером",
  },
  {
    title: "Зустріч із друзями",
    subtitle: "Невимушене спілкування, європейська кухня та напої",
    image: IMG.intimate,
    note: "Деталі бронювання уточнюйте в ресторані",
  },
  {
    title: "Подія у вашому форматі",
    subtitle: "Розкажіть, що плануєте — обговоримо можливості MOOD",
    image: "/images/mood-refresh/food-main.jpg",
    note: "Умови та доступність — за погодженням",
  },
];

export const events = [
  {
    title: "Весілля",
    desc: "День, у якому важлива кожна мить.",
    image: "/images/mood-refresh/event-romantic.png",
  },
  {
    title: "Дні народження та ювілеї",
    desc: "Тепла зустріч із найближчими людьми.",
    image: IMG.party,
  },
  {
    title: "Корпоративи",
    desc: "Святкування, що об’єднує команду.",
    image: IMG.event,
  },
  {
    title: "Конференції та презентації",
    desc: "Ділові події з продуманою організацією.",
    image: IMG.intimate,
  },
];

export const defaultContact = {
  name: "",
  phone: "",
  date: "",
  guests: 40,
  format: "Весілля",
  menu: "banquet",
  extras: [],
  comment: "",
};

export const menus = [
  {
    id: "european",
    title: "Меню ресторану MOOD",
    detail: "Європейська кухня — переглянути актуальне меню",
  },
  {
    id: "banquet",
    title: "Бенкетний формат",
    detail: "Склад і формат частування узгоджуються індивідуально",
  },
  {
    id: "buffet",
    title: "Фуршет / легкий формат",
    detail: "Можливість і умови потрібно погодити з менеджером",
  },
];

export const extraOptions = [
  "Власні напої",
  "Декорування зали",
  "Звукове обладнання",
  "Музичний гурт або діджей",
  "Караоке",
  "Фотозона",
  "Фотограф",
  "Ведучий",
];
