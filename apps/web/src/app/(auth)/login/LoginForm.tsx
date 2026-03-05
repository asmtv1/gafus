"use client";

import { useCSRFStore } from "@gafus/csrf";
import { FormField } from "@shared/components/ui/FormField";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { useCaughtError } from "@shared/hooks/useCaughtError";
import { useZodForm } from "@shared/hooks/useZodForm";
import { loginFormSchema } from "@shared/lib/validation/authSchemas";
import {
  checkLoginRateLimit,
  checkUserStateAction,
} from "@shared/server-actions";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { VkIdOneTap } from "@shared/components/auth/VkIdOneTap";

import styles from "./login.module.css";

import type { LoginFormSchema } from "@shared/lib/validation/authSchemas";

export default function LoginForm() {
  const [catchError] = useCaughtError();
  const { token: csrfToken, loading: csrfLoading, error: csrfError } = useCSRFStore();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const {
    form,
    handleSubmit,
    formState: { errors },
  } = useZodForm(loginFormSchema, {
    username: "",
    password: "",
  });

  useEffect(() => {
    const vkToken = searchParams.get("vk_id_token");
    if (!vkToken) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("vk_id_token");
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });

    signIn("credentials", {
      username: "__vk_id__",
      password: vkToken,
      redirect: false,
    }).then((res) => {
      if (res?.error) {
        alert("Ошибка авторизации VK ID");
      } else {
        router.replace("/courses");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount when token present
  }, []);

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

      // Проверяем статус подтверждения номера перед входом
      const userState = await checkUserStateAction(username);

      if (userState.needsConfirm) {
        router.push("/confirm");
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
        {csrfLoading ? (
          "Загрузка..."
        ) : (
          <Image src="/uploads/login-paw.png" alt="Войти" width={140} height={135} />
        )}
      </button>
      <VkIdOneTap />
    </form>
  );
}
