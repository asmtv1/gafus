"use client";

import Link from "next/link";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import { FormField, TextField } from "@shared/components/ui/FormField";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { useCaughtError } from "@shared/hooks/useCaughtError";
import { useZodForm } from "@shared/hooks/useZodForm";
import { registerUserAction } from "@shared/server-actions";
import { registerFormSchema } from "@shared/lib/validation/authSchemas";
import type { ConsentPayload } from "@shared/constants/consent";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./register.module.css";

import type { RegisterFormSchema } from "@shared/lib/validation/authSchemas";

export function RegisterForm() {
  const router = useRouter();
  const { token: csrfToken, loading: csrfLoading, error: csrfError } = useCSRFStore();

  const {
    form,
    handleSubmit,
    formState: { errors, isValid },
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
  const [tempSessionId] = useState<string>(() => crypto.randomUUID());

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

    setIsPending(true);
    try {
      const result = await registerUserAction(
        username,
        data.email.trim().toLowerCase(),
        data.password,
        tempSessionId,
        consentPayload,
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

      router.replace("/courses");
    } catch (error) {
      reportClientError(error, { issueKey: "RegisterForm", keys: { operation: "submit_register" } });
      catchError(error);
      setIsPending(false);
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
      />

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
        <input
          type="checkbox"
          {...form.register("acceptDataDistribution")}
          aria-invalid={!!errors.acceptDataDistribution}
        />
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

      {csrfError && <div className={styles.errorText}>Ошибка загрузки токена: {csrfError}</div>}

      <button
        className={styles.button}
        type="submit"
        disabled={isPending || !isValid || csrfLoading}
      >
        {isPending ? "регистрация..." : "зарегистрироваться"}
      </button>
    </form>
  );
}
