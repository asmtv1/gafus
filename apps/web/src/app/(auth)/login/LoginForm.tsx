"use client";

import { useCSRFStore } from "@gafus/csrf";
import { FormField } from "@shared/components/ui/FormField";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import styles from "./login.module.css";

import type { LoginFormData as FormData } from "@gafus/types";

import { commonValidationRules } from "@/shared/hooks/useFormValidation";

export default function LoginForm() {
  const [caughtError, setCaughtError] = useState<Error | null>(null);
  const { token: csrfToken, loading: csrfLoading, error: csrfError } = useCSRFStore();
  const form = useForm<FormData>({ mode: "onBlur" });
  const router = useRouter();
  const {
    handleSubmit,
    formState: { errors },
  } = form;

  if (caughtError) {
    throw caughtError;
  }

  const onSubmit = async (data: FormData) => {
    if (csrfLoading || !csrfToken) {
      alert("Загрузка... Попробуйте снова");
      return;
    }

    try {
      // Отключаем авто-редирект next-auth и вручную направляем на текущем хосте
      const res = await signIn("credentials", {
        username: data.username.toLowerCase().trim(),
        password: data.password,
        redirect: false,
      });

      if (res?.error) {
        alert("Неверное имя пользователя или пароль");
        return;
      }

      // На успешный логин переходим на курсы в рамках текущего origin,
      // чтобы избежать смены хоста (например, на localhost:3002)
      router.replace("/courses");
    } catch (error) {
      setCaughtError(error as Error);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      <FormField
        id="username"
        label="Имя пользователя"
        name="username"
        type="text"
        autoComplete="username"
        visuallyHiddenLabel
        className={styles.input}
        errorClassName={styles.errorText}
        placeholder="Имя пользователя"
        form={form}
        rules={{
          ...commonValidationRules.name,
          required: "Введите имя пользователя",
          pattern: {
            value: /^[A-Za-z0-9_]+$/,
            message: "Только английские буквы, цифры или _",
          },
        }}
      />

      <PasswordInput
        placeholder="Пароль"
        label="Пароль"
        visuallyHiddenLabel
        className={styles.input}
        errorClassName={styles.errorText}
        autoComplete="current-password"
        {...form.register("password", {
          required: "Введите пароль",
          maxLength: { value: 12, message: "Максимум 12 символов" },
          pattern: {
            value: /^[A-Za-z0-9]+$/,
            message: "Только английские буквы или цифры",
          },
        })}
        error={errors.password?.message}
      />

      {csrfError && <div className={styles.errorText}>Ошибка загрузки токена: {csrfError}</div>}
      <div className={styles.buttonsContainer}>
        <Link href="/register" className={styles.registerLink}>
          <button className={styles.registerButton}>Регистрация</button>
        </Link>
        <Link href="/passwordReset" className={styles.forgotLink}>
          <button className={styles.forgotButton}>Забыли пароль?</button>
        </Link>
      </div>
      <button className={styles.button} type="submit" disabled={csrfLoading}>
        {csrfLoading ? "Загрузка..." : <img src="/login-paw.png" alt="Войти" />}
      </button>
    </form>
  );
}
