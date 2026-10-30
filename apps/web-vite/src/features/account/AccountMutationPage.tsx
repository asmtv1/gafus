import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "../../shared/auth/authApi";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { navigate, RouteLink } from "../../shared/router/location";
import {
  accountOperationError, changeAccountPassword, requestEmailChange, setAccountPassword,
} from "./accountApi";
import {PrimaryButton} from "../../shared/ui";
import {CancelNavigationLink} from "../../shared/ui/CancelNavigationLink";
import "./AccountFormTheme.css";

type Mode = "email" | "set" | "change";

function validPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 100 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

/** Mounted only in the keyed authenticated subtree (one actor and route per form). */
export function AccountMutationPage({ mode, actorId }: { mode: Mode; actorId: string }) {
  const cache = useQueryClient();
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<"email" | "current" | "new" | "confirm" | null>(null);
  const emailField = useRef<HTMLInputElement>(null);
  const currentField = useRef<HTMLInputElement>(null);
  const newField = useRef<HTMLInputElement>(null);
  const confirmField = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"editing" | "pending" | "success" | "reauth">("editing");
  const inFlight = useRef(false);
  const committed = useRef(false);
  const active = useRef(true);
  // Actor/route keyed unmount invalidates all late A responses before B mounts.
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const passwordMode = mode !== "email";
  const heading = mode === "email" ? "Изменить email" :
    mode === "set" ? "Установить пароль" : "Сменить пароль";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || committed.current) return;
    const normalized = email.trim().toLowerCase();
    if (mode === "email" && (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
      normalized.length > 255)) {
      setInvalidField("email");
      setError("Введите корректный email.");
      emailField.current?.focus();
      return;
    }
    if (passwordMode && (!validPassword(password) || password !== confirm ||
      (mode === "change" && currentPassword.length === 0))) {
      const field = mode === "change" && currentPassword.length === 0
        ? "current" : !validPassword(password) ? "new" : "confirm";
      setInvalidField(field);
      setError("Пароль: 8–100 символов, заглавная и строчная буквы, цифра; повторите его без ошибок.");
      ({ current: currentField, new: newField, confirm: confirmField }[field]).current?.focus();
      return;
    }
    inFlight.current = true;
    setInvalidField(null);
    setState("pending");
    setError("");
    try {
      if (mode === "email") await requestEmailChange(normalized, currentPassword || undefined);
      else if (mode === "set") await setAccountPassword(password);
      else await changeAccountPassword(currentPassword, password);
      if (!active.current) return;
      committed.current = true;
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
      setState(passwordMode ? "reauth" : "success");
      if (passwordMode) {
        // Core has committed the password and revoked old sessions.
        // Even 401 from logout must never turn success into mutation failure.
        void (async () => {
          try { await logout(); } catch { /* already revoked, no second mutation */ }
          finally {
            // A's slow logout response must not remove B's newly established client identity.
            const current = cache.getQueryData<{ id: string }>(CURRENT_USER_QUERY_KEY);
            if (!current || current.id === actorId) {
              cache.clear();
              navigate("/login");
            }
          }
        })();
      }
    } catch (caught) {
      if (!active.current) return;
      setInvalidField(null);
      setError(accountOperationError(caught, mode === "email" ? "email" : "password"));
      setState("editing");
    } finally {
      inFlight.current = false;
    }
  }

  if (state === "success") {
    return <section className="account-card gafus-account-form" aria-label="Запрос смены email принят">
      <h2>Проверьте почту</h2>
      <p role="status">Запрос принят. Смена email произойдёт только после явного подтверждения из письма.</p>
      <RouteLink to="/profile">В профиль</RouteLink>
    </section>;
  }
  if (state === "reauth") {
    return <section className="account-card gafus-account-form" aria-label="Пароль сохранён">
      <h2>Пароль сохранён</h2>
      <p role="status">Предыдущие сессии отозваны. Для безопасности войдите снова.</p>
      <RouteLink to="/login">Войти снова</RouteLink>
    </section>;
  }

  return <section className="account-card gafus-account-form">
    <h2>{heading}</h2>
    <p>Изменения выполняются только после нажатия кнопки. Автоматических повторов нет.</p>
    <form onSubmit={submit}>
      {mode === "email" && <>
        <label htmlFor="account-new-email">Новый email</label>
        <input id="account-new-email" type="email" autoComplete="email"
          ref={emailField} aria-invalid={invalidField === "email" || undefined}
          aria-describedby={invalidField === "email" ? "account-form-error" : undefined}
          value={email} maxLength={255} required disabled={state === "pending"}
          onChange={event => setEmail(event.target.value)} />
      </>}
      {mode === "email" && <>
        <label htmlFor="account-email-current-password">Текущий пароль (если установлен)</label>
        <input id="account-email-current-password" type="password"
          autoComplete="current-password" maxLength={100}
          value={currentPassword} disabled={state === "pending"}
          onChange={event => setCurrentPassword(event.target.value)} />
        <p>Для аккаунта с паролем его необходимо указать.
          Если вы входите только через VK ID и пароль не установлен, оставьте поле пустым.</p>
      </>}
      {mode === "change" && <>
        <label htmlFor="account-current-password">Текущий пароль</label>
        <input id="account-current-password" type="password" autoComplete="current-password"
          ref={currentField} aria-invalid={invalidField === "current" || undefined}
          aria-describedby={invalidField === "current" ? "account-form-error" : undefined}
          value={currentPassword} required disabled={state === "pending"}
          onChange={event => setCurrentPassword(event.target.value)} />
      </>}
      {passwordMode && <>
        <label htmlFor="account-new-password">Новый пароль</label>
        <input id="account-new-password" type="password" autoComplete="new-password"
          ref={newField} aria-invalid={invalidField === "new" || undefined}
          aria-describedby={invalidField === "new" ? "account-form-error" : undefined}
          value={password} required minLength={8} maxLength={100}
          disabled={state === "pending"} onChange={event => setPassword(event.target.value)} />
        <label htmlFor="account-confirm-password">Повторите пароль</label>
        <input id="account-confirm-password" type="password" autoComplete="new-password"
          ref={confirmField} aria-invalid={invalidField === "confirm" || undefined}
          aria-describedby={invalidField === "confirm" ? "account-form-error" : undefined}
          value={confirm} required minLength={8} maxLength={100}
          disabled={state === "pending"} onChange={event => setConfirm(event.target.value)} />
      </>}
      {error && <p id="account-form-error" role="alert">{error}</p>}
      <div className="gafus-account-actions">
        <PrimaryButton type="submit" disabled={state === "pending"}>
          {state === "pending" ? "Сохраняем…" : "Сохранить"}
        </PrimaryButton>
        <CancelNavigationLink fallback="/profile" disabled={state === "pending"} />
      </div>
    </form>
  </section>;
}
