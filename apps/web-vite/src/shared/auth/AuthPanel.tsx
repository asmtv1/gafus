import { Loading } from "../ui";
import { useState, type FormEvent } from "react";
import { useCurrentUser, useLogin, useLogout } from "./useAuth";
import { ApiError } from "../api/client";
import { RegisterPanel } from "./RegisterPanel";
import { LandingVkEntry } from "../../brand/LandingVkEntry";
import {VkConsentOptIn} from "../../features/vk-consent/VkConsentOptIn";
import type {VkConsentWire} from "../../features/vk-consent/vkConsentSource";
import { navigate, RouteLink, useRoutePath } from "../router/location";
import { SecondaryButton } from "../ui";
import { PasswordVisibilityField } from "./PasswordVisibilityField";
import "../../brand/auth-next-parity.css";

export function AuthPanel({showVkConsentOptIn=false,
  vkConsentSyntheticTransport,vkContextToken,vkState}:{
  showVkConsentOptIn?:boolean;
  vkConsentSyntheticTransport?:VkConsentWire;
  vkContextToken?:string;
  vkState?:string;
}={}) {
  const route = useRoutePath();
  const current = useCurrentUser();
  const login = useLogin();
  const logout = useLogout();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registering, setRegistering] = useState(false);

  if (current.isPending) return <Loading message="Проверяем сессию…" />;
  if (current.isError) return <p role="alert">{
    current.error instanceof ApiError && current.error.code === "RATE_LIMITED"
      ? "Слишком много запросов. Попробуйте позже."
      : "Не удалось получить статус авторизации."
  }</p>;

  if (current.data) {
    return (
      <section aria-label="Авторизация">
        <p>Пользователь: <strong>{current.data.username}</strong></p>
        <SecondaryButton variant="red" type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Выйти
        </SecondaryButton>
        {logout.isError && <p role="alert">{
          logout.error instanceof ApiError && logout.error.code === "RATE_LIMITED"
            ? "Слишком много запросов. Попробуйте позже."
            : "Не удалось завершить сессию. Повторите попытку."
        }</p>}
      </section>
    );
  }

  if (registering || route === "/register") {
    return <RegisterPanel onCancel={() => {
      setRegistering(false);
      if (route === "/register") navigate("/login");
    }} />;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (login.isPending) return;
    login.mutate({ username: username.trim().toLowerCase(), password }, {
      onSuccess: () => navigate("/courses"),
    });
  }

  return (
    <section aria-label="Авторизация" className="gafus-auth-panel">
      {route === "/login" && <img className="gafus-login-logo" src="/images/auth-login-wizard.png"
        alt="Авторизация — собака-волшебник" width="1125" height="1398" />}
      {route === "/login" && <p className="gafus-login-prompt">Если у Вас еще нет аккаунта -{" "}
        <RouteLink to="/register">зарегистрируйтесь</RouteLink>.
      </p>}
      <form onSubmit={submit}>
        <label htmlFor="login-name" className="gafus-visually-hidden">Имя пользователя</label>
        <input id="login-name" autoComplete="username" placeholder="Имя пользователя"
          value={username} onChange={event => setUsername(event.target.value)} required />
        <PasswordVisibilityField id="login-password" placeholder="Пароль"
          value={password} onChange={event => setPassword(event.target.value)}
          autoComplete="current-password" />
        <div className="gafus-login-links">
          <RouteLink to="/register">Регистрация</RouteLink>
          <RouteLink to="/passwordReset">Забыли пароль?</RouteLink>
        </div>
        <button type="submit" className="gafus-login-submit" disabled={login.isPending}
          aria-label="Войти">
          {login.isPending ? "Входим…" : <>
            <img src="/images/auth-login-paw.png" alt="" width="120" height="125" />
            <span className="gafus-visually-hidden">Войти</span>
          </>}
        </button>
        {login.isError && <p role="alert">Вход недоступен: {login.error.message}</p>}
      </form>
      <div className="gafus-auth-vk-entry"><LandingVkEntry /></div>
      <VkConsentOptIn enabled={showVkConsentOptIn}
        contextToken={vkContextToken} state={vkState}
        transport={vkConsentSyntheticTransport}/>
      <p className="note gafus-dev-note">Локальный тестовый интерфейс.</p>
    </section>
  );
}
