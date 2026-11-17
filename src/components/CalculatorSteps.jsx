import { extraOptions, menus, MOOD } from "../data/siteData.js";
import { formatUaPhone } from "../../shared/ua-phone.js";
import { getLocalDateInputValue } from "../../shared/date.js";
import { Icon } from "./Icons.jsx";
import { UaPhoneField } from "./UaPhoneField.jsx";

export function EventStep({ data, update }) {
  return (
    <div className="calc-step">
      <h3>Розкажіть про вашу подію</h3>
      <div className="form-grid">
        <label>
          Формат заходу
          <select
            value={data.format}
            onChange={(e) => update("format", e.target.value)}
          >
            <option>Весілля</option>
            <option>Корпоратив</option>
            <option>День народження</option>
            <option>Фуршет</option>
            <option>Конференція / презентація</option>
            <option>Інше</option>
          </select>
        </label>
        <label>
          Дата заходу
          <input
            type="date"
            min={getLocalDateInputValue()}
            value={data.date}
            onChange={(e) => update("date", e.target.value)}
          />
        </label>
      </div>
      <div className="guest-control">
        <div>
          <b>Орієнтовна кількість гостей</b>
          <small>Вкажіть від 10 до 200 осіб</small>
        </div>
        <div className="counter">
          <button
            type="button"
            onClick={() => update("guests", Math.max(10, data.guests - 5))}
          >
            <Icon name="minus" />
          </button>
          <strong>{data.guests}</strong>
          <button
            type="button"
            onClick={() => update("guests", Math.min(200, data.guests + 5))}
          >
            <Icon name="plus" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MenuStep({ data, update }) {
  return (
    <div className="calc-step">
      <h3>Оберіть бажаний формат меню</h3>
      <p className="step-hint">
        Актуальне меню ресторану відкривається окремо. Умови бенкетного
        частування узгоджуються з менеджером.
      </p>
      <div className="menu-options">
        {menus.map((menu) => (
          <button
            type="button"
            key={menu.id}
            className={
              data.menu === menu.id ? "menu-option selected" : "menu-option"
            }
            onClick={() => update("menu", menu.id)}
          >
            <span className="radio-dot" />
            <span className="menu-option-copy">
              <b>{menu.title}</b>
              <small>{menu.detail}</small>
            </span>
            <span className="option-arrow">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExtrasStep({ data, toggleExtra }) {
  return (
    <div className="calc-step">
      <h3>Додаткові побажання</h3>
      <p className="step-hint">
        Позначте побажання, можливість реалізації яких потрібно узгодити з
        менеджером.
      </p>
      <div className="extra-grid">
        {extraOptions.map((item) => (
          <button
            type="button"
            key={item}
            className={
              data.extras.includes(item)
                ? "extra-option selected"
                : "extra-option"
            }
            onClick={() => toggleExtra(item)}
          >
            <span className="check-box">
              {data.extras.includes(item) && <Icon name="check" size={14} />}
            </span>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ContactStep({ data, update, clearError }) {
  return (
    <div className="calc-step">
      <h3>Залиште контактні дані</h3>
      <div className="form-grid">
        <label>
          Ваше ім’я
          <input
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            value={data.name}
            onChange={(e) => {
              update("name", e.target.value);
              clearError();
            }}
            onBlur={() => update("name", data.name.trim())}
            placeholder="Як до вас звертатися"
          />
        </label>
        <UaPhoneField
          id="calculator-phone"
          value={data.phone}
          onChange={(value) => {
            update("phone", value);
            clearError();
          }}
        />
      </div>
      <label className="full-label">
        Коментар або побажання
        <textarea
          rows="3"
          value={data.comment}
          onChange={(e) => update("comment", e.target.value)}
          placeholder="Розкажіть трохи більше про ваше свято"
        />
      </label>
    </div>
  );
}

export function SummaryStep({ data }) {
  return (
    <div className="calc-step">
      <h3>Перевірте ваш запит</h3>
      <div className="summary-list">
        <div>
          <span>Формат</span>
          <b>{data.format}</b>
        </div>
        <div>
          <span>Дата</span>
          <b>{data.date || "Ще не визначена"}</b>
        </div>
        <div>
          <span>Кількість гостей</span>
          <b>{data.guests}</b>
        </div>
        <div>
          <span>Меню</span>
          <b>{menus.find((m) => m.id === data.menu)?.title}</b>
        </div>
        <div>
          <span>Додаткові побажання</span>
          <b>{data.extras.length ? data.extras.join(", ") : "Не обрано"}</b>
        </div>
        <div>
          <span>Контакт</span>
          <b>
            {data.name.trim()} · {formatUaPhone(data.phone)}
          </b>
        </div>
      </div>
      <div className="budget-estimate">
        <span>Вартість події</span>
        <strong>Уточнюється індивідуально</strong>
        <small>
          Вартість бенкетного меню та додаткових послуг залежить від обраного
          формату. Менеджер MOOD підготує розрахунок після уточнення деталей.
        </small>
        <a href={MOOD.menuUrl} target="_blank" rel="noopener noreferrer">
          Переглянути меню ресторану →
        </a>
      </div>
    </div>
  );
}
