"use client";

import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";
import { FormField } from "@/components/ui/FormField";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { checkUserConfirmed } from "@/lib/auth/checkUserConfirmed";
import { getUserPhoneByUsername } from "@/lib/auth/getUserPhoneByUsername";
import { useState } from "react";

type FormData = {
  username: string;
  password: string;
};

export default function LoginForm() {
  const [caughtError, setCaughtError] = useState<Error | null>(null);
  const router = useRouter();

  const form = useForm<FormData>({ mode: "onBlur" });
  const {
    handleSubmit,
    formState: { errors },
  } = form;

  if (caughtError) {
    throw caughtError;
  }

  const onSubmit = async (data: FormData) => {
    try {
      const res = await signIn("credentials", {
        username: data.username.toLowerCase().trim(),
        password: data.password,
        redirect: false,
      });

      if (res?.error) {
        alert("❌ Неверное имя пользователя или пароль");
        return;
      }

      const phone = await getUserPhoneByUsername(data.username);
      if (!phone) return;

      const isConfirmed = await checkUserConfirmed(phone);

      if (isConfirmed) {
        console.log("✅ Подтвержден → /courses");
        router.push("/courses");
      } else {
        console.log("⚠️ Не подтверждён → /confirm");
        router.push(`/confirm?phone=${encodeURIComponent(phone)}`);
      }
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
        placeholder="Имя пользователя"
        form={form}
        rules={{ required: "Введите имя пользователя" }}
      />

      <PasswordInput
        className={styles.input}
        placeholder="Пароль"
        autoComplete="current-password"
        {...form.register("password", {
          required: "Введите пароль",
          minLength: { value: 6, message: "Минимум 6 символов" },
        })}
        error={errors.password?.message}
      />

      <button className={styles.button} type="submit">
        Войти
      </button>
    </form>
  );
}
