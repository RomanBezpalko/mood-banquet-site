import { useEffect, useState } from "react";
import { MOOD } from "../data/siteData.js";
import { Icon } from "./Icons.jsx";

export function FloatingContact() {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  return (
    <>
      {expanded && (
        <button
          className="contact-backdrop"
          type="button"
          aria-label="Закрити способи зв’язку"
          onClick={() => setExpanded(false)}
        />
      )}
      <div className={`floating-contact ${expanded ? "is-open" : ""}`}>
        {expanded ? (
          <div className="contact-methods" aria-label="Способи зв’язку">
            <a
              className="contact-method phone-method"
              href={`tel:${MOOD.phoneE164}`}
            >
              <span>Зателефонувати {MOOD.phoneDisplay}</span>
              <b>
                <Icon name="phone" size={22} />
              </b>
            </a>
            <a
              className="contact-method viber-method"
              href={MOOD.viberUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Написати у Viber</span>
              <b>
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M12.1 2C6.4 2 2 5.8 2 10.8c0 2.1.8 4 2.2 5.5L3.5 22l5.7-2.1c.9.3 1.9.5 2.9.5 5.7 0 10-3.8 10-9.1S17.8 2 12.1 2Zm0 16.4c-.9 0-1.8-.2-2.6-.5l-.5-.2-3.1 1.1.7-3-.4-.5c-1.2-1.2-1.8-2.7-1.8-4.4 0-3.9 3.4-7 7.7-7s7.7 3.1 7.7 7-3.4 7.5-7.7 7.5Zm4.2-5.1c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8.9-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.3.1-.4l.4-.5c.1-.1.1-.2.2-.4.1-.1 0-.3 0-.4-.1-.1-.5-1.3-.7-1.7-.2-.4-.4-.4-.5-.4h-.4c-.1 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.4 2.3.9 2.3.6 2.7.6.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.3-.2-.5-.3Z"
                  />
                </svg>
              </b>
            </a>
            <a
              className="contact-method telegram-method"
              href={MOOD.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Написати у Telegram</span>
              <b>
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M21.8 4.3 18.6 20c-.2 1.1-.8 1.4-1.7.9l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.4-.1-.6-.6-.2L6.5 14l-4.7-1.5c-1-.3-1-1 .2-1.5L20.4 3.4c.9-.3 1.7.2 1.4.9Z"
                  />
                </svg>
              </b>
            </a>
            <button
              className="contact-method-close"
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Закрити меню зв’язку"
            >
              <Icon name="close" size={25} />
            </button>
          </div>
        ) : (
          <button
            className="contact-trigger"
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={expanded}
            aria-label="Зв’язок — відкрити способи зв’язку"
          >
            <span>Зв’язок</span>
            <b>
              <Icon name="phone" size={22} />
            </b>
          </button>
        )}
      </div>
    </>
  );
}
