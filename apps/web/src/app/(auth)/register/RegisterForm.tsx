"use client";

import Link from "next/link";
import { trackEvent } from "@gafus/analytics";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import { FormField, TextField } from "@shared/components/ui/FormField";
import { PrimaryButton } from "@shared/components/ui";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { useCaughtError } from "@shared/hooks/useCaughtError";
import { useZodForm } from "@shared/hooks/useZodForm";
import { registerUserAction } from "@shared/server-actions";
import { previewRegistrationPromoAction } from "@shared/server-actions/auth";
import { registerFormSchema } from "@shared/lib/validation/authSchemas";
import type { ConsentPayload } from "@shared/constants/consent";
import { suggestRegisterEmailDomain } from "@gafus/core/validation/email-domain-suggestion";
import {
  getRegistrationPromoStatusMessage,
  shouldBlockRegistrationForPromo,
  type RegistrationPromoUiState,
} from "@shared/lib/auth/registration-promo-ui";
import { signIn } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import styles from "./register.module.css";

import type { RegisterFormSchema } from "@shared/lib/validation/authSchemas";

const REGISTRATION_SESSION_KEY = "gafus.registration.temp-session-id.v1";

function getRegistrationTempSessionId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  const existing = window.sessionStorage.getItem(REGISTRATION_SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.sessionStorage.setItem(REGISTRATION_SESSION_KEY, next);
  return next;
}

export function RegisterForm() {
  const router = useRouter();
  const pathname = usePathname() ?? "/register";
  const searchParams = useSearchParams();
  const { token: csrfToken, loading: csrfLoading, error: csrfError } = useCSRFStore();

  const {
    form,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useZodForm(
    registerFormSchema,
    {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptPersonalData: false,
      acceptPrivacyPolicy: false,
      acceptDataDistribution: false,
    },
    {
      /* после первого blur — дальше перепроверка при вводе; рамка/текст ошибки видны до сабмита */
      mode: "onTouched",
      reValidateMode: "onChange",
    },
  );

  const [catchError] = useCaughtError();
  const [isPending, setIsPending] = useState(false);
  // This is an idempotency key only. Passwords and form values are deliberately never persisted.
  const [tempSessionId] = useState<string>(getRegistrationTempSessionId);
  const [emailTypoSuggestion, setEmailTypoSuggestion] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState(() => searchParams.get("promoCode")?.trim() ?? "");
  const [promoState, setPromoState] = useState<RegistrationPromoUiState>("idle");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const promoRequestId = useRef(0);

  const emailRegisterOptions = useMemo(
    () => ({
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
        const s = suggestRegisterEmailDomain(e.target.value);
        setEmailTypoSuggestion(s?.full ?? null);
      },
      onChange: () => {
        setEmailTypoSuggestion(null);
      },
    }),
    [],
  );

  const onSubmit = async (data: RegisterFormSchema) => {
    if (csrfLoading || !csrfToken) {
      alert("Загрузка... Попробуйте снова");
      return;
    }

    const consentPayload: ConsentPayload = {
      acceptPersonalData: data.acceptPersonalData,
      acceptPrivacyPolicy: data.acceptPrivacyPolicy,
      acceptDataDistribution: data.acceptDataDistribution,
    };

    const username = data.name.toLowerCase().trim();
    const safePromoCode = promoCode.trim() || undefined;

    if (shouldBlockRegistrationForPromo(safePromoCode ?? "", promoState)) {
      setPromoMessage("Сначала примените промокод или очистите поле.");
      setPromoState("invalid");
      return;
    }

    trackEvent({
      eventName: "button_click",
      platform: "web",
      pathOrScreen: pathname,
      elementId: "cta-register-submit",
    });

    setIsPending(true);
    try {
      const result = await registerUserAction(
        username,
        data.email.trim().toLowerCase(),
        data.password,
        tempSessionId,
        consentPayload,
        safePromoCode,
      );

      if (result?.error) {
        alert(result.error);
        setIsPending(false);
        return;
      }

      const res = await signIn("credentials", {
        username,
        password: data.password,
        redirect: false,
      });

      if (res?.error) {
        alert(res.error);
        setIsPending(false);
        return;
      }

      trackEvent({
        eventName: "register_success",
        platform: "web",
        pathOrScreen: pathname,
        flow: "email",
      });

      router.replace("/courses");
    } catch (error) {
      reportClientError(error, { issueKey: "RegisterForm", keys: { operation: "submit_register" } });
      catchError(error);
      setIsPending(false);
    }
  };

  const onApplyPromo = async () => {
    const rawCode = promoCode.trim();
    if (!rawCode) {
      setPromoState("idle");
      setPromoMessage(null);
      return;
    }
    const requestId = promoRequestId.current + 1;
    promoRequestId.current = requestId;
    setPromoState("checking");
    setPromoMessage("Проверяем промокод…");
    try {
      const result = await previewRegistrationPromoAction(rawCode);
      if (promoRequestId.current !== requestId) return;
      if (!result.success) {
        setPromoState("invalid");
        setPromoMessage(result.error);
        return;
      }
      setPromoCode(result.code);
      setPromoState("applied");
      setPromoMessage(`Промокод ${result.code} применён.`);
    } catch (error) {
      if (promoRequestId.current !== requestId) return;
      reportClientError(error, { issueKey: "RegisterForm", keys: { operation: "preview_registration_promo" } });
      setPromoState("network-error");
      setPromoMessage("Не удалось проверить промокод. Проверьте соединение и попробуйте снова.");
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      <TextField
        id="name"
        label="Имя пользователя"
        visuallyHiddenLabel
        name="name"
        placeholder="Имя пользователя"
        className={styles.input}
        errorClassName={styles.errorText}
        autoComplete="username"
        form={form}
      />

      <FormField
        id="email"
        label="Email"
        visuallyHiddenLabel
        className={styles.input}
        errorClassName={styles.errorText}
        name="email"
        type="email"
        placeholder="email@example.com"
        form={form}
        autoComplete="email"
        ariaDescribedBy={emailTypoSuggestion ? "email-typo-hint" : undefined}
        registerOptions={emailRegisterOptions}
      />

      {emailTypoSuggestion && (
        <div
          id="email-typo-hint"
          role="status"
          className={styles.emailTypoHint}
        >
          <span className={styles.emailTypoHintText}>
            Возможно, имелось в виду {emailTypoSuggestion}?
          </span>
          <PrimaryButton
            type="button"
            className={styles.emailTypoFix}
            onClick={() => {
              setValue("email", emailTypoSuggestion, {
                shouldValidate: true,
                shouldDirty: true,
              });
              setEmailTypoSuggestion(null);
            }}
          >
            Исправить
          </PrimaryButton>
        </div>
      )}

      <div className="flex flex-col">
        <label htmlFor="promoCode" className="sr-only">
          Промокод
        </label>
        <div className={styles.promoControls}>
          <input
            id="promoCode"
            className={styles.input}
            value={promoCode}
            onChange={(event) => {
              promoRequestId.current += 1;
              setPromoCode(event.target.value);
              setPromoState("idle");
              setPromoMessage(null);
            }}
            placeholder="Промокод (необязательно)"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={64}
            aria-describedby="registration-promo-status"
            aria-invalid={promoState === "invalid" || promoState === "network-error"}
          />
          <PrimaryButton
            type="button"
            className={styles.promoApply}
            onClick={onApplyPromo}
            disabled={promoState === "checking" || !promoCode.trim()}
          >
            {promoState === "checking" ? "Проверяем…" : "Применить промокод"}
          </PrimaryButton>
        </div>
        <p
          id="registration-promo-status"
          className={promoState === "invalid" || promoState === "network-error" ? styles.errorText : styles.info}
          role={promoState === "invalid" || promoState === "network-error" ? "alert" : "status"}
          aria-live="polite"
        >
          {promoState !== "idle" ? getRegistrationPromoStatusMessage(promoState, promoMessage) : null}
        </p>
      </div>

      <PasswordInput
        className={styles.input}
        label="Пароль"
        visuallyHiddenLabel
        placeholder="Пароль"
        autoComplete="new-password"
        {...form.register("password")}
        error={errors.password?.message}
        errorClassName={styles.errorText}
      />

      <PasswordInput
        className={styles.input}
        label="Повторите пароль"
        placeholder="Повторите пароль"
        visuallyHiddenLabel
        autoComplete="new-password"
        {...form.register("confirmPassword")}
        error={errors.confirmPassword?.message}
        errorClassName={styles.errorText}
      />

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          {...form.register("acceptPersonalData")}
          aria-invalid={!!errors.acceptPersonalData}
        />
        <span className={styles.checkboxLabel}>
          Даю согласие на{" "}
          <Link
            href="/personal.html"
            className={styles.checkboxLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            обработку персональных данных
          </Link>
        </span>
      </label>

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          {...form.register("acceptPrivacyPolicy")}
          aria-invalid={!!errors.acceptPersonalData}
        />
        <span className={styles.checkboxLabel}>
          Ознакомлен(а) с{" "}
          <Link
            href="/policy.html"
            className={styles.checkboxLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Политикой конфиденциальности
          </Link>
        </span>
      </label>

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          {...form.register("acceptDataDistribution")}
          aria-invalid={!!errors.acceptPersonalData}
        />
        <span className={styles.checkboxLabel}>
          Даю согласие на{" "}
          <Link
            href="/personal-distribution.html"
            className={styles.checkboxLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            размещение данных в публичном профиле
          </Link>
        </span>
      </label>

      {errors.acceptPersonalData?.message && (
        <span className={`${styles.errorText} ${styles.consentsError}`} role="alert">
          {errors.acceptPersonalData.message}
        </span>
      )}

      {csrfError && <div className={styles.errorText}>Ошибка загрузки токена: {csrfError}</div>}

      <PrimaryButton
        className={styles.button}
        type="submit"
        disabled={isPending || csrfLoading}
        fullWidth
      >
        {isPending ? "регистрация..." : "зарегистрироваться"}
      </PrimaryButton>
      <Link href="/login" className={styles.loginLink}>
        Уже есть аккаунт? Войти
      </Link>
    </form>
  );
}
