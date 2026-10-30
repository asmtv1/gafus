import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  previewRegistrationPromoCode, registerAccount,
  type RegisterBody,
} from "./registerApi";
import { clearRegistrationAttempt, registrationAttemptId } from "./registrationSession";
import { recordExplicitLogin } from "./useAuth";
import { navigate } from "../router/location";
import {PrimaryButton} from "../ui";
import { LandingVkEntry } from "../../brand/LandingVkEntry";
import { PasswordVisibilityField } from "./PasswordVisibilityField";
import { suggestRegisterEmailDomain } from "@gafus/core-client/validation/email-domain-suggestion";

type PromoState = "idle" | "checking" | "applied" | "invalid";

const legalDocuments = [
  {
    id: "registration-personal-data",
    key: "acceptPersonalData",
    text: "Согласен(на) на",
    label: "обработку персональных данных",
    href: "/personal.html",
  },
  {
    id: "registration-privacy-policy",
    key: "acceptPrivacyPolicy",
    text: "Ознакомлен(а) с",
    label: "Политикой конфиденциальности",
    href: "/policy.html",
  },
  {
    id: "registration-data-distribution",
    key: "acceptDataDistribution",
    text: "Даю согласие на",
    label: "размещение данных в публичном профиле",
    href: "/personal-distribution.html",
  },
] as const;

export function RegisterPanel({ onCancel }: { onCancel: () => void }) {
  const cache = useQueryClient();
  const [attemptId] = useState(() => registrationAttemptId(window.sessionStorage));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTypoSuggestion, setEmailTypoSuggestion] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [promoCode, setPromoCode] = useState(() =>
    new URLSearchParams(window.location.search).get("promoCode")?.trim() ?? "");
  const [approvedPromo, setApprovedPromo] = useState<string | null>(null);
  const [promoState, setPromoState] = useState<PromoState>("idle");
  const [promoMessage, setPromoMessage] = useState("");
  const currentPromoInput = useRef(promoCode);
  const [errorMessage, setErrorMessage] = useState("");
  const [consents, setConsents] = useState({
    acceptPersonalData: false,
    acceptPrivacyPolicy: false,
    acceptDataDistribution: false,
  });

  const register = useMutation({
    mutationFn: registerAccount,
    onSuccess: ({ user }) => {
      clearRegistrationAttempt(window.sessionStorage);
      setPassword("");
      setConfirmPassword("");
      recordExplicitLogin(cache, user);
      navigate("/courses");
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const preview = useMutation({
    mutationFn: previewRegistrationPromoCode,
    onSuccess: ({ code }, submittedCode) => {
      // A response for an old promo input must not re-approve another value.
      if (currentPromoInput.current.trim() !== submittedCode) return;
      setApprovedPromo(code);
      setPromoCode(code);
      currentPromoInput.current = code;
      setPromoState("applied");
      setPromoMessage("Промокод " + code + " применён.");
    },
    onError: (_error, submittedCode) => {
      if (currentPromoInput.current.trim() !== submittedCode) return;
      setPromoState("invalid");
      setPromoMessage("Не удалось применить промокод. Проверьте его.");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (register.isPending || preview.isPending) return;
    setErrorMessage("");
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(name.trim())) {
      setErrorMessage("Логин: 3–50 символов, латиница, цифры и _.");
      return;
    }
    if (password.length < 8 || password.length > 100 ||
        !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setErrorMessage("Пароль: 8–100 символов, заглавная и строчная буквы, цифра.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Пароли не совпадают.");
      return;
    }
    if (!Object.values(consents).every(Boolean)) {
      setErrorMessage("Необходимо подтвердить все три согласия.");
      return;
    }
    if (promoCode.trim() && (!approvedPromo || approvedPromo !== promoCode.trim())) {
      setErrorMessage("Сначала проверьте промокод или очистите поле.");
      return;
    }
    const body: RegisterBody = {
      name: name.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      password,
      tempSessionId: attemptId,
      registrationChannel: "WEB",
      consentPayload: {
        acceptPersonalData: true,
        acceptPrivacyPolicy: true,
        acceptDataDistribution: true,
      },
      ...(approvedPromo ? { promoCode: approvedPromo } : {}),
    };
    register.mutate(body);
  }

  function applyPromo() {
    if (preview.isPending || !promoCode.trim()) return;
    setPromoMessage("Проверяем промокод…");
    setPromoState("checking");
    preview.mutate(promoCode.trim());
  }

  function cancel() {
    setPassword("");
    setConfirmPassword("");
    onCancel();
  }

  return (
    <section className="gafus-register-panel" aria-label="Регистрация">
      <div className="gafus-register-logo-container">
        <img className="gafus-register-logo" src="/images/auth-register-wizard.png"
          alt="Собака-волшебник" width="1312" height="1199" />
      </div>
      <form onSubmit={submit}>
        <label className="gafus-visually-hidden" htmlFor="registration-name">Имя пользователя</label>
        <input
          id="registration-name" autoComplete="username" placeholder="Имя пользователя" required minLength={3}
          maxLength={50} pattern="[A-Za-z0-9_]+"
          value={name} onChange={event => setName(event.target.value)}
        />
        <label className="gafus-visually-hidden" htmlFor="registration-email">Email</label>
        <input
          id="registration-email" type="email" autoComplete="email" placeholder="email@example.com" required
          aria-describedby={emailTypoSuggestion ? "registration-email-typo-hint" : undefined}
          value={email} onChange={event => {
            setEmail(event.target.value);
            setEmailTypoSuggestion(null);
          }}
          onBlur={event => setEmailTypoSuggestion(
            suggestRegisterEmailDomain(event.target.value)?.full ?? null,
          )}
        />
        {emailTypoSuggestion && <div className="gafus-email-typo-hint"
          id="registration-email-typo-hint" role="status">
          <span>Возможно, имелось в виду {emailTypoSuggestion}?</span>
          <PrimaryButton type="button" onClick={() => {
            setEmail(emailTypoSuggestion);
            setEmailTypoSuggestion(null);
          }}>Исправить</PrimaryButton>
        </div>}
        <label className="gafus-visually-hidden" htmlFor="registration-promo">Промокод (необязательно)</label>
        <div className="registration-promo-controls">
          <input
            id="registration-promo" placeholder="Промокод (необязательно)" autoComplete="off" value={promoCode}
            maxLength={64} onChange={event => {
              currentPromoInput.current = event.target.value;
              setPromoCode(event.target.value);
              setApprovedPromo(null);
              setPromoState("idle");
              setPromoMessage("");
            }}
          />
          <PrimaryButton type="button" onClick={applyPromo}
            disabled={preview.isPending || !promoCode.trim()}>
            {promoState === "checking" ? "Проверяем…" : "Применить промокод"}
          </PrimaryButton>
        </div>
        {promoMessage && <p role="status">{promoMessage}</p>}
        <PasswordVisibilityField id="registration-password" placeholder="Пароль"
          autoComplete="new-password" minLength={8} maxLength={100}
          value={password} onChange={event => setPassword(event.target.value)} />
        <PasswordVisibilityField id="registration-confirm-password" placeholder="Повторите пароль"
          autoComplete="new-password" value={confirmPassword}
          onChange={event => setConfirmPassword(event.target.value)} />
        <div className="registration-consents">
          {legalDocuments.map(document => (
            <label key={document.id} htmlFor={document.id} className="registration-checkbox">
              <input
                id={document.id} type="checkbox" required
                checked={consents[document.key]}
                onChange={event => setConsents(previous => ({
                  ...previous, [document.key]: event.target.checked,
                }))}
              />
              <span>
                {document.text}{" "}
                <a href={document.href} target="_blank" rel="noopener noreferrer">
                  {document.label}
                </a>
              </span>
            </label>
          ))}
        </div>
        {errorMessage && <p role="alert">{errorMessage}</p>}
        <PrimaryButton type="submit" disabled={register.isPending || preview.isPending}>
          {register.isPending ? "Регистрируем…" : "зарегистрироваться"}
        </PrimaryButton>
        <button type="button" className="gafus-register-login-link" onClick={cancel}>
          Войти
        </button>
      </form>
      <LandingVkEntry />
    </section>
  );
}
