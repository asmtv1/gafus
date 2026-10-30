import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { confirmPasswordReset, requestPasswordReset } from "./passwordRecoveryApi";
import { RouteLink } from "../router/location";
import { PrimaryButton } from "../ui";
import { CancelNavigationLink } from "../ui/CancelNavigationLink";
import "../../features/account/AccountFormTheme.css";
import "../../brand/auth-next-parity.css";

export function PasswordResetRequest() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const request = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => setSent(true),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.isPending) return;
    request.mutate(email.trim().toLowerCase());
  }

  return (
    <section aria-label="Восстановление доступа" className="gafus-password-reset">
      <div className="gafus-reset-paws" aria-hidden="true">
        <img src="/uploads/paw.svg" alt="" /><img src="/uploads/paw.svg" alt="" />
        <img src="/uploads/paw.svg" alt="" /><img src="/uploads/paw.svg" alt="" />
      </div>
      <h1 className="gafus-reset-title">Сброс пароля</h1>
      <p className="gafus-reset-subtitle">
        Укажите email аккаунта. Если запросите новое письмо, ссылка из предыдущего
        перестанет работать.
      </p>
      <form className="gafus-reset-form" onSubmit={submit}>
        <label htmlFor="recovery-email" className="gafus-visually-hidden">Email</label>
        <input id="recovery-email" type="email" required autoComplete="email"
          placeholder="Email" value={email} onChange={event => setEmail(event.target.value)} />
        <div className="gafus-reset-actions">
          <PrimaryButton type="submit" disabled={request.isPending}>
            {request.isPending ? "отправка..." : "восстановить пароль"}
          </PrimaryButton>
          <CancelNavigationLink fallback="/login" disabled={request.isPending}
            className="gafus-reset-cancel" />
        </div>
        {sent && <>
          <p role="status" className="gafus-reset-status">
            Если аккаунт с таким email существует, проверьте почту.
            Повторный запрос возможен через 2 минуты и отменит предыдущую ссылку.
          </p>
          <RouteLink to="/reset-password" className="gafus-reset-enter-link">
            Уже есть ссылка — ввести новый пароль
          </RouteLink>
        </>}
        {request.isError && <p role="alert" className="gafus-reset-error">
          Не удалось отправить письмо. Попробуйте позже.
        </p>}
      </form>
      <img className="gafus-reset-wizard" src="/images/password-reset-wizard.png"
        alt="Собака-волшебник ищет пароль" width="1536" height="1024" />
      <img className="gafus-reset-bottom-paw" src="/uploads/passwordReset_paw.png"
        alt="" width="307" height="224" />
      <RouteLink to="/login" className="gafus-reset-back">Вернуться ко входу</RouteLink>
    </section>
  );
}

function initialResetToken(): string {
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export function PasswordResetConfirm() {
  const [token, setToken] = useState(initialResetToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [succeeded, setSucceeded] = useState(false);
  const reset = useMutation({
    mutationFn: ({ token: tokenValue, password: next }: {
      token: string; password: string;
    }) => confirmPasswordReset(tokenValue, next),
    onSuccess: () => {
      setPassword("");
      setConfirm("");
      setToken("");
      setSucceeded(true);
    },
  });

  useEffect(() => {
    // Remove the one-time token from browser URL/history without erasing
    // arbitrary non-token query params or storing it in persistent storage.
    const params = new URLSearchParams(window.location.search);
    if (!params.has("token")) return;
    params.delete("token");
    const query = params.toString();
    window.history.replaceState(window.history.state, "",
      window.location.pathname + (query ? "?" + query : "") + window.location.hash);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reset.isPending) return;
    setError("");
    if (token.length < 32 || token.length > 128) {
      setError("Не указан действительный токен сброса пароля.");
      return;
    }
    if (password.length < 8 || password.length > 100 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Пароль: 8–100 символов, заглавная и строчная буквы, цифра.");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    reset.mutate({ token, password });
  }

  return (
    <section aria-label="Новый пароль">
      <h2>Задать новый пароль</h2>
      {succeeded
        ? <p role="status">Пароль обновлён. <RouteLink to="/login">Перейти ко входу</RouteLink>.</p>
        : <form onSubmit={submit}>
          <label htmlFor="recovery-token">Токен из письма</label>
          <input id="recovery-token" value={token} required minLength={32} maxLength={128}
            autoComplete="off" onChange={event => setToken(event.target.value)} />
          <label htmlFor="recovery-password">Новый пароль</label>
          <input id="recovery-password" type="password" required autoComplete="new-password"
            minLength={8} maxLength={100} value={password}
            onChange={event => setPassword(event.target.value)} />
          <label htmlFor="recovery-confirm">Повторите пароль</label>
          <input id="recovery-confirm" type="password" required autoComplete="new-password"
            value={confirm} onChange={event => setConfirm(event.target.value)} />
          {error && <p role="alert">{error}</p>}
          {reset.isError && <p role="alert">Не удалось обновить пароль. Проверьте ссылку.</p>}
          <PrimaryButton type="submit" disabled={reset.isPending}>
            {reset.isPending ? "Сохраняем…" : "Сохранить пароль"}
          </PrimaryButton>
        </form>}
      <p><RouteLink to="/login">Вернуться ко входу</RouteLink></p>
    </section>
  );
}
