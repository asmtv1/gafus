"use client";

import Link from "next/link";
import { AppBackButtonLink } from "@/shared/components/ui";
import { trackEvent } from "@gafus/analytics";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { reportClientError } from "@gafus/error-handling";
import { useZodForm } from "@shared/hooks/useZodForm";
import { getVkConsentPromoAction, submitVkConsentAction } from "@shared/server-actions";
import { vkConsentFormSchema } from "@shared/lib/validation/authSchemas";
import type { ConsentPayload } from "@shared/constants/consent";

import styles from "../register/register.module.css";

export function VkConsentForm() {
  const router = useRouter();
  const pathname = usePathname() ?? "/vk-consent";
  const searchParams = useSearchParams();
  const contextToken = searchParams.get("context");
  // The context, not the URL, is authoritative for the initial selection.
  // The transport currently has no safe read-model for it, so this starts empty
  // and the completion transaction keeps the server-side value when unchanged.
  const [promoCode, setPromoCode] = useState("");

  const {
    form,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useZodForm(
    vkConsentFormSchema,
    {
      acceptPersonalData: false,
      acceptPrivacyPolicy: false,
      acceptDataDistribution: false,
    },
    { mode: "onChange" },
  );

  const [isPending, setIsPending] = useState(false);
  const [loginGrantToken, setLoginGrantToken] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [tempSessionId] = useState(() => {
    if (typeof window === "undefined") return crypto.randomUUID();
    const key = `gafus.vk-consent.attempt.${contextToken ?? "missing"}`;
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.sessionStorage.setItem(key, next);
    return next;
  });

  useEffect(() => {
    if (!contextToken) return;
    void getVkConsentPromoAction(contextToken).then((result) => {
      if (result.success) setPromoCode(result.promoCode ?? "");
    });
  }, [contextToken]);

  if (!contextToken) {
    return (
      <div className={styles.form}>
        <p className={styles.info}>Ссылка устарела или недействительна.</p>
        <AppBackButtonLink href="/">На главную</AppBackButtonLink>
      </div>
    );
  }

  const completeLogin = async (grant: string) => {
    setLoginError(null);
    const res = await signIn("credentials", {
      username: "__vk_id__",
      password: grant,
      redirect: false,
    });
    if (res?.error) {
      setLoginError("Регистрация завершена, но войти не удалось. Повторите вход.");
      return;
    }
    trackEvent({
      eventName: "login_success",
      platform: "web",
      pathOrScreen: pathname,
      method: "vk",
    });
    router.replace("/courses", { scroll: false });
    router.refresh();
  };

  const onSubmit = async (data: ConsentPayload) => {
    setIsPending(true);
    try {
      const result = await submitVkConsentAction(
        contextToken,
        data,
        promoCode.trim() || undefined,
        tempSessionId,
      );
      if (result.success) {
        setLoginGrantToken(result.loginGrantToken);
        await completeLogin(result.loginGrantToken);
      } else {
        setError("acceptPersonalData", { message: result.error });
      }
    } catch (err) {
      reportClientError(err, {
        issueKey: "VkConsentForm",
        keys: { operation: "submit" },
      });
      setError("acceptPersonalData", { message: "Ошибка. Попробуйте снова." });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form
      className={`${styles.form} ${styles.vkConsentForm}`}
      onSubmit={handleSubmit(onSubmit)}
    >
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          {...form.register("acceptPersonalData")}
          aria-invalid={!!errors.acceptPersonalData}
        />
        <span className={styles.checkboxLabel}>
          Даю{" "}
          <Link
            href="/personal.html"
            className={styles.checkboxLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            согласие на обработку персональных данных
          </Link>
        </span>
      </label>
      {errors.acceptPersonalData?.message && (
        <span className={styles.errorText}>{errors.acceptPersonalData.message}</span>
      )}

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          {...form.register("acceptPrivacyPolicy")}
          aria-invalid={!!errors.acceptPrivacyPolicy}
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
      {errors.acceptPrivacyPolicy?.message && (
        <span className={styles.errorText}>{errors.acceptPrivacyPolicy.message}</span>
      )}

      <label className={styles.checkboxRow}>
        <input type="checkbox" {...form.register("acceptDataDistribution")} />
        <span className={styles.checkboxLabel}>
          Даю{" "}
          <Link
            href="/personal-distribution.html"
            className={styles.checkboxLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            согласие на размещение данных в публичном профиле
          </Link>
        </span>
      </label>
      {errors.acceptDataDistribution?.message && (
        <span className={styles.errorText}>{errors.acceptDataDistribution.message}</span>
      )}

      <label className="sr-only" htmlFor="promoCode">
        Промокод
      </label>
      <input
        id="promoCode"
        className={styles.input}
        value={promoCode}
        onChange={(event) => setPromoCode(event.target.value)}
        placeholder="Промокод (необязательно)"
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={64}
      />

      {loginError ? (
        <p className={styles.errorText} role="alert">
          {loginError}
        </p>
      ) : null}
      {loginGrantToken ? (
        <button
          className={styles.button}
          type="button"
          disabled={isPending}
          onClick={() => void completeLogin(loginGrantToken)}
        >
          Повторить вход
        </button>
      ) : null}
      <button className={styles.button} type="submit" disabled={isPending || !isValid}>
        {isPending ? "Сохранение..." : "Принять и продолжить"}
      </button>
    </form>
  );
}
