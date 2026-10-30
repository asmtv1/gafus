import { useState, type ChangeEvent } from "react";

/** Auth-field parity with Next's PasswordInput: local-only visibility state. */
export function PasswordVisibilityField({ id, placeholder, value, onChange,
  autoComplete, minLength, maxLength, required = true }: {
    id: string;
    placeholder: string;
    value: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    autoComplete: "current-password" | "new-password";
    minLength?: number;
    maxLength?: number;
    required?: boolean;
  }) {
  const [visible, setVisible] = useState(false);
  return <div className="gafus-password-control">
    <label htmlFor={id} className="gafus-visually-hidden">{placeholder}</label>
    <div className="gafus-password-inner">
      <input id={id} type={visible ? "text" : "password"}
        placeholder={placeholder} value={value} onChange={onChange}
        autoComplete={autoComplete} required={required}
        minLength={minLength} maxLength={maxLength} />
      <button type="button" className="gafus-password-toggle" tabIndex={-1}
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        onClick={() => setVisible(previous => !previous)}>
        <img src={visible ? "/uploads/hide.png" : "/uploads/Show.png"}
          alt={visible ? "Скрыть пароль" : "Показать пароль"}
          width="20" height="20" />
      </button>
    </div>
  </div>;
}
