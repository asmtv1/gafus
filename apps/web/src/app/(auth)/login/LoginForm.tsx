"use client";

import { trackEvent } from "@gafus/analytics";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import { FormField } from "@shared/components/ui/FormField";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { useCaughtError } from "@shared/hooks/useCaughtError";
import { useZodForm } from "@shared/hooks/useZodForm";
import { loginFormSchema } from "@shared/lib/validation/authSchemas";
import { checkLoginRateLimit } from "@shared/server-actions";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import styles from "./login.module.css";

import type { LoginFormSchema } from "@shared/lib/validation/authSchemas";

export default function LoginForm() {
  const [catchError] = useCaughtError();
  const { token: csrfToken, loading: csrfLoading, error: csrfError } = useCSRFStore();
  const router = useRouter();
  const pathname = usePathname() ?? "/login";
  const {
    form,
    handleSubmit,
    formState: { errors },
  } = useZodForm(loginFormSchema, {
    username: "",
    password: "",
  });

  const onSubmit = async (data: LoginFormSchema) => {
    if (csrfLoading || !csrfToken) {
      alert("Загрузка... Попробуйте снова");
      return;
    }

    try {
      const username = data.username.toLowerCase().trim();

      const rateLimit = await checkLoginRateLimit();
      if (!rateLimit.allowed) {
        alert("Слишком много попыток. Попробуйте позже.");
        return;
      }

      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen: pathname,
        elementId: "cta-login-submit",
      });

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

      trackEvent({
        eventName: "login_success",
        platform: "web",
        pathOrScreen: pathname,
        method: "credentials",
      });

      // На успешный логин переходим на курсы в рамках текущего origin,
      // чтобы избежать смены хоста (например, на localhost:3002)
      router.replace("/courses");
    } catch (error) {
      reportClientError(error, { issueKey: "LoginForm", keys: { operation: "submit_login" } });
      catchError(error);
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
      <button className={styles.button} type="submit" disabled={csrfLoading} aria-label="Войти">
        {csrfLoading ? "Загрузка..." : <Image src="/images/auth-login-paw.png" alt="" width={120} height={125} />}
      </button>
    </form>
  );
}
