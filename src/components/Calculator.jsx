import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toUaE164 } from "../../shared/ua-phone.js";
import { sendLead } from "../leadApi.js";
import { defaultContact, menus } from "../data/siteData.js";
import { Icon } from "./Icons.jsx";
import {
  ContactStep,
  EventStep,
  ExtrasStep,
  MenuStep,
  SummaryStep,
} from "./CalculatorSteps.jsx";

export function Calculator({ open, onClose }) {
  const [data, setData] = useState(defaultContact);
  const [website, setWebsite] = useState("");
  const [formStartedAt, setFormStartedAt] = useState(() => Date.now());
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const dialogRef = useRef(null);
  const contactIsValid =
    data.name.trim().length >= 2 && data.phone.length === 9;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusable = [
        ...dialogRef.current.querySelectorAll(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
        ),
      ];
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    dialogRef.current?.querySelector("button, input")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setData(defaultContact);
      setWebsite("");
      setFormStartedAt(Date.now());
      setStep(0);
      setSubmitted(false);
      setSending(false);
      setSubmitError("");
    }
  }, [open]);

  if (!open) return null;

  const update = (key, value) => setData((prev) => ({ ...prev, [key]: value }));
  const toggleExtra = (label) =>
    update(
      "extras",
      data.extras.includes(label)
        ? data.extras.filter((x) => x !== label)
        : [...data.extras, label],
    );
  const steps = [
    "Подія та дата",
    "Меню та бюджет",
    "Додаткові побажання",
    "Контактні дані",
    "Підтвердження",
  ];
  const next = () => {
    if (step === 3 && !contactIsValid) {
      setSubmitError(
        data.name.trim().length < 2
          ? "Вкажіть ім’я (не менше 2 символів)."
          : "Введіть повний номер телефону: рівно 9 цифр після +380.",
      );
      return;
    }
    setSubmitError("");
    setStep((s) => Math.min(4, s + 1));
  };
  const previous = () => setStep((s) => Math.max(0, s - 1));
  const submitCalculatorLead = async () => {
    setSending(true);
    setSubmitError("");
    try {
      await sendLead({
        source: "Калькулятор бенкету",
        name: data.name.trim(),
        phone: toUaE164(data.phone),
        eventDate: data.date,
        guests: data.guests,
        eventFormat: data.format,
        menu: menus.find((m) => m.id === data.menu)?.title || data.menu,
        extras: data.extras,
        comment: data.comment,
        website,
        formStartedAt,
      });
      setSubmitted(true);
    } catch (error) {
      setSubmitError(
        error.message || "Не вдалося надіслати заявку. Спробуйте ще раз.",
      );
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div
      className="calculator-modal"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        id="calculator"
        className="calculator-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calculator-title"
      >
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
          aria-label="Закрити калькулятор"
        >
          <Icon name="close" />
        </button>
        <div className="calculator-intro">
          <span className="section-kicker">ПОПЕРЕДНІЙ РОЗРАХУНОК</span>
          <h2 id="calculator-title">
            Плануємо ваше <em>свято</em>
          </h2>
          <p>
            Заповніть кілька кроків, щоб передати менеджеру параметри вашої
            події та отримати персональну пропозицію.
          </p>
          <div className="calculator-tip">
            Деталі, меню та вартість узгоджуються з командою MOOD.
          </div>
        </div>
        <div className="calculator-body">
          <input
            className="bot-trap"
            tabIndex="-1"
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <div className="calc-progress">
            <div className="progress-caption">
              <span>КРОК {step + 1} ІЗ 5</span>
              <span>{steps[step]}</span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${(step + 1) * 20}%` }} />
            </div>
          </div>
          {submitted ? (
            <div className="calc-success" role="status" aria-live="polite">
              <span className="success-mark">
                <Icon name="check" size={26} />
              </span>
              <h3>Запит сформовано</h3>
              <p>
                Дякуємо! Заявку надіслано команді MOOD у Telegram. Менеджер
                зв’яжеться з вами для уточнення деталей.
              </p>
              <button className="button button-dark" onClick={onClose}>
                Закрити
              </button>
            </div>
          ) : (
            <>
              {step === 0 && <EventStep data={data} update={update} />}{" "}
              {step === 1 && <MenuStep data={data} update={update} />}{" "}
              {step === 2 && (
                <ExtrasStep data={data} toggleExtra={toggleExtra} />
              )}{" "}
              {step === 3 && (
                <ContactStep
                  data={data}
                  update={update}
                  clearError={() => setSubmitError("")}
                />
              )}{" "}
              {step === 4 && <SummaryStep data={data} />}
              {submitError && (
                <p className="form-error" role="alert">
                  {submitError}
                </p>
              )}
              <div className="calc-actions">
                {step > 0 ? (
                  <button
                    type="button"
                    className="back-button"
                    onClick={previous}
                  >
                    ← Назад
                  </button>
                ) : (
                  <span />
                )}
                {step < 4 ? (
                  <button
                    type="button"
                    className="button button-dark"
                    onClick={next}
                  >
                    Далі <Icon name="arrow" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button-dark"
                    disabled={!contactIsValid || sending}
                    onClick={submitCalculatorLead}
                  >
                    {sending ? "Надсилаємо…" : "Надіслати заявку"}{" "}
                    <Icon name="arrow" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
