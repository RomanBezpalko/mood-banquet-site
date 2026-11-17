import { useState } from "react";
import { toUaE164 } from "../../shared/ua-phone.js";
import { sendLead } from "../leadApi.js";
import { MOOD } from "../data/siteData.js";
import { Icon, InstagramIcon } from "./Icons.jsx";
import { UaPhoneField } from "./UaPhoneField.jsx";

export function Contact() {
  const [form, setForm] = useState({ name: "", phone: "" });
  const [website, setWebsite] = useState("");
  const [formStartedAt] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submitCallback = async (event) => {
    event.preventDefault();
    if (form.name.trim().length < 2 || form.phone.length !== 9) {
      setErrorMessage(
        form.name.trim().length < 2
          ? "Вкажіть ім’я (не менше 2 символів)."
          : "Введіть повний номер телефону: рівно 9 цифр після +380.",
      );
      return;
    }
    setSending(true);
    setErrorMessage("");
    try {
      await sendLead({
        source: "Форма зворотного дзвінка",
        name: form.name.trim(),
        phone: toUaE164(form.phone),
        website,
        formStartedAt,
      });
      setDone(true);
    } catch (error) {
      setErrorMessage(
        error.message || "Не вдалося надіслати заявку. Спробуйте ще раз.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="contact-section" id="contact">
      <div className="contact-content">
        <div className="contact-copy">
          <span className="section-kicker">РЕСТОРАН MOOD · ДНІПРО</span>
          <h2>
            Зустрінемось у <em>MOOD</em>
          </h2>
          <p>
            Тут зустрічаються друзі та історії. Зателефонуйте нам або залиште
            контакти, щоб обговорити вашу подію.
          </p>
          <a href={`tel:${MOOD.phoneE164}`} className="contact-phone">
            <Icon name="phone" /> {MOOD.phoneDisplay}
          </a>
          <a
            className="contact-address"
            href={MOOD.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="pin" /> {MOOD.address}
          </a>
          <div className="contact-detail">
            <span className="contact-detail-label">ГРАФІК РОБОТИ</span>
            <strong>{MOOD.hours}</strong>
          </div>
          <div className="contact-links">
            <a href={MOOD.menuUrl} target="_blank" rel="noopener noreferrer">
              Меню ресторану ↗
            </a>
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
          </div>
        </div>
        <form className="callback-form" onSubmit={submitCallback}>
          <input
            className="bot-trap"
            tabIndex="-1"
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          {done ? (
            <div className="callback-success" role="status" aria-live="polite">
              <span>
                <Icon name="check" />
              </span>
              <h3>Дякуємо за звернення!</h3>
              <p>
                Заявку на зворотний дзвінок надіслано команді MOOD у Telegram.
                Ми зв’яжемося з вами.
              </p>
              <button
                type="button"
                className="back-button"
                onClick={() => {
                  setDone(false);
                  setForm({ name: "", phone: "" });
                }}
              >
                Надіслати ще раз
              </button>
            </div>
          ) : (
            <>
              <h3>Замовити зворотний дзвінок</h3>
              <p>Заповніть коротку форму</p>
              <label>
                Ваше ім’я
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => {
                    update("name", e.target.value);
                    setErrorMessage("");
                  }}
                  onBlur={() => update("name", form.name.trim())}
                  placeholder="Ваше ім’я"
                />
              </label>
              <UaPhoneField
                id="callback-phone"
                value={form.phone}
                onChange={(value) => {
                  update("phone", value);
                  setErrorMessage("");
                }}
              />
              {errorMessage && (
                <p className="form-error" role="alert">
                  {errorMessage}
                </p>
              )}
              <button
                type="submit"
                className="button button-yellow"
                disabled={
                  sending ||
                  form.name.trim().length < 2 ||
                  form.phone.length !== 9
                }
              >
                {sending ? "Надсилаємо…" : "Замовити зворотний дзвінок"}{" "}
                <Icon name="arrow" />
              </button>
              <small>
                Натискаючи кнопку, ви погоджуєтеся на обробку персональних
                даних.
              </small>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
