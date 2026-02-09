"use client";

import { FormField, TextField } from "@shared/components/ui/FormField";
import { useCaughtError } from "@shared/hooks/useCaughtError";
import { useZodForm } from "@shared/hooks/useZodForm";
import { sendPasswordResetRequestAction } from "@shared/server-actions";
import { passwordResetFormSchema } from "@shared/lib/validation/authSchemas";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useState } from "react";

import styles from "./passwordReset.module.css";

import type { PasswordResetFormSchema } from "@shared/lib/validation/authSchemas";

export function PasswordResetForm() {
  const {
    form,
    handleSubmit,
    setError,
    clearErrors,
    formState: { isValid },
  } = useZodForm(passwordResetFormSchema, {
    username: "",
    phone: "",
  });

  const [catchError] = useCaughtError();
  const [isPending, setIsPending] = useState(false);
  const [status, setStatus] = useState("");

  // Валидация телефона теперь обрабатывается Zod схемой

  const onSubmit = async (data: PasswordResetFormSchema) => {
    const phoneNumberObj = parsePhoneNumberFromString(data.phone, "RU");

    if (!phoneNumberObj?.isValid()) {
      setError("phone", { message: "Неверный формат телефона" });
      return;
    }

    clearErrors("phone");
    setIsPending(true);

    try {
      await sendPasswordResetRequestAction(data.username, data.phone);
      setStatus("Если указанные данные верны, вам придёт сообщение в Telegram");
    } catch (error) {
      catchError(error);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
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

      {status && <p className={styles.status}>{status}</p>}
    </form>
  );
}
