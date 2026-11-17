import { useState } from "react";
import { sanitizeUaPhoneDigits } from "../../shared/ua-phone.js";

export function UaPhoneField({
  id,
  value,
  onChange,
  label = "Номер телефону",
}) {
  const [touched, setTouched] = useState(false);
  const isComplete = value.length === 9;

  return (
    <div className="ua-phone-field">
      <label htmlFor={id}>{label}</label>
      <div
        className={`ua-phone-control ${touched && !isComplete ? "is-invalid" : ""}`}
      >
        <span className="ua-phone-prefix" aria-hidden="true">
          +380
        </span>
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
          onChange={(event) =>
            onChange(sanitizeUaPhoneDigits(event.target.value))
          }
        />
      </div>
      <small
        id={`${id}-hint`}
        className={`ua-phone-hint ${touched && !isComplete ? "is-invalid" : ""}`}
      >
        {touched && !isComplete
          ? `Введіть ще ${9 - value.length} ${9 - value.length === 1 ? "цифру" : "цифр"} після +380.`
          : "Код країни +380 вже встановлено. Введіть 9 цифр номера."}
      </small>
    </div>
  );
}
