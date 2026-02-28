"use client";

import Link from "next/link";
import { FormField, TextField } from "@shared/components/ui/FormField";
import { useZodForm } from "@shared/hooks/useZodForm";
import { passwordResetFormSchema } from "@shared/lib/validation/authSchemas";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useState } from "react";

import styles from "./passwordReset.module.css";

import type { PasswordResetFormSchema } from "@shared/lib/validation/authSchemas";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.gafus.ru";

export function PasswordResetForm() {
  const {
    form,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isValid },
  } = useZodForm(passwordResetFormSchema, {
    username: "",
    phone: "",
  });

  const [isPending, setIsPending] = useState(false);
  const [status, setStatus] = useState("");

  // Валидация телефона теперь обрабатывается Zod схемой

  const onSubmit = async (data: PasswordResetFormSchema) => {
    const phoneNumberObj = parsePhoneNumberFromString(data.phone, "RU");

    if (!phoneNumberObj?.isValid()) {
      setError("phone", { message: "Неверный формат телефона" });
      return;
    }

    clearErrors();
    setIsPending(true);

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/password-reset-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.username, phone: data.phone }),
      });

      if (!response.ok) {
        let errorMessage = "Ошибка отправки запроса. Попробуйте позже.";
        if (response.status === 429) {
          errorMessage = "Слишком много запросов. Попробуйте позже.";
        } else {
          try {
            const contentType = response.headers.get("content-type");
            if (contentType?.includes("application/json")) {
              const errorData: { error?: string } = await response.json();
              if (errorData.error) errorMessage = errorData.error;
            }
          } catch {
            // Игнорируем ошибки парсинга — используем дефолтное сообщение
          }
        }
        setError("root", { message: errorMessage });
        return;
      }

      setStatus("Если указанные данные верны, вам придёт сообщение в Telegram");
    } catch (error) {
      setError("root", {
        message: error instanceof Error ? error.message : "Ошибка отправки запроса. Попробуйте позже.",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      {errors.root?.message && (
        <p className={styles.errorText} role="alert">
          {errors.root.message}
        </p>
      )}
      <TextField
        id="username"
        label="Логин"
        visuallyHiddenLabel
        name="username"
        placeholder="Логин"
        className={styles.input}
        form={form}
        errorClassName={styles.errorText}
        // Валидация теперь через Zod схему
      />

      <FormField
        id="phone"
        label="Телефон"
        visuallyHiddenLabel
        className={styles.input}
        errorClassName={styles.errorText}
        name="phone"
        type="tel"
        placeholder="+7XXXXXXXXXX"
        form={form}
        // Валидация теперь через Zod схему
      />

      <button className={styles.button} type="submit" disabled={isPending || !isValid}>
        {isPending ? "отправка..." : "восстановить пароль"}
      </button>

      {status && (
        <>
          <p className={styles.status}>{status}</p>
          <Link href="/reset-password" className={styles.linkButton}>
            Ввести код
          </Link>
        </>
      )}
    </form>
  );
}
