"use client";

import { useCSRFStore } from "@gafus/csrf";
import { FormField } from "@shared/components/ui/FormField";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { useZodForm } from "@shared/hooks/useZodForm";
import { loginFormSchema } from "@shared/lib/validation/authSchemas";
import { checkUserStateAction } from "@shared/server-actions";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./login.module.css";

import type { LoginFormSchema } from "@shared/lib/validation/authSchemas";

export default function LoginForm() {
  const [caughtError, setCaughtError] = useState<Error | null>(null);
  const { token: csrfToken, loading: csrfLoading, error: csrfError } = useCSRFStore();
  const { form, handleSubmit, formState: { errors } } = useZodForm(
    loginFormSchema,
    {
      username: "",
      password: "",
    }
  );
  const router = useRouter();

  if (caughtError) {
    throw caughtError;
  }

  const onSubmit = async (data: LoginFormSchema) => {
    if (csrfLoading || !csrfToken) {
      alert("Загрузка... Попробуйте снова");
      return;
    }

    try {
      const username = data.username.toLowerCase().trim();
      
      // Проверяем статус подтверждения номера перед входом
      const userState = await checkUserStateAction(username);
      
      if (!userState.confirmed && userState.phone) {
        // Если номер не подтверждён, перенаправляем на страницу подтверждения
        router.push(`/confirm?phone=${encodeURIComponent(userState.phone)}`);
        return;
      }

      // Отключаем авто-редирект next-auth и вручную направляем на текущем хосте
      const res = await signIn("credentials", {
        username,
        password: data.password,
        redirect: false,
      });

      if (res?.error) {
        alert(res.error);
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
        // Валидация теперь через Zod схему
      />

      <PasswordInput
        placeholder="Пароль"
        label="Пароль"
        visuallyHiddenLabel
        className={styles.input}
        errorClassName={styles.errorText}
        autoComplete="current-password"
        {...form.register("password")}
        error={errors.password?.message}
      />

      {csrfError && <div className={styles.errorText}>Ошибка загрузки токена: {csrfError}</div>}
      <div className={styles.buttonsContainer}>
        <Link href="/register" className={`${styles.registerLink} ${styles.registerButton}`}>
          Регистрация
        </Link>
        <Link href="/passwordReset" className={`${styles.forgotLink} ${styles.forgotButton}`}>
          Забыли пароль?
        </Link>
      </div>
      <button className={styles.button} type="submit" disabled={csrfLoading}>
        {csrfLoading ? "Загрузка..." : <Image src="/uploads/login-paw.png" alt="Войти" width={140} height={135} />}
      </button>
    </form>
  );
}