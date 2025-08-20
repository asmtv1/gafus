"use client";

import { FormField, TextField } from "@shared/components/ui/FormField";
import { commonValidationRules } from "@shared/hooks/useFormValidation";
import { checkPhoneMatchesUsername, sendPasswordResetRequest } from "@shared/lib/auth/login-utils";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useState } from "react";
import { useForm } from "react-hook-form";

import styles from "./passwordReset.module.css";

import type { PasswordResetFormData as FormData } from "@gafus/types";

export function PasswordResetForm() {
  const form = useForm<FormData>({
    mode: "onBlur",
    defaultValues: {
      username: "",
      phone: "",
    },
  });

  const {
    handleSubmit,
    setError,
    clearErrors,
    formState: { isValid },
  } = form;

  const [isPending, setIsPending] = useState(false);
  const [status, setStatus] = useState("");
  const [caughtError, setCaughtError] = useState<Error | null>(null);

  // Функция валидации телефона
  const validatePhone = (value: string): boolean | string => {
    const phoneNumber = parsePhoneNumberFromString(value, "RU");
    return phoneNumber?.isValid() || "Неверный номер телефона";
  };

  if (caughtError) {
    throw caughtError;
  }

  const onSubmit = async (data: FormData) => {
    const phoneNumberObj = parsePhoneNumberFromString(data.phone, "RU");

    if (!phoneNumberObj?.isValid()) {
      setError("phone", { message: "Неверный формат телефона" });
      return;
    }

    clearErrors("phone");
    setIsPending(true);

    try {
      const matches = await checkPhoneMatchesUsername(data.username, data.phone);
      if (!matches) {
        setError("phone", {
          message: "Телефон не совпадает с именем пользователя",
        });
        setIsPending(false);
        return;
      }

      await sendPasswordResetRequest(data.username, data.phone);
      setStatus("Если данные верны, вам придёт сообщение в Telegram");
    } catch (error) {
      setCaughtError(error as Error);
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
        rules={{
          ...commonValidationRules.name,
          required: "Введите логин",
          pattern: {
            value: /^[A-Za-z0-9_]+$/,
            message: "Только английские буквы, цифры или _",
          },
        }}
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
        rules={{
          required: "Введите номер телефона",
          validate: validatePhone,
        }}
      />

      <button className={styles.button} type="submit" disabled={isPending || !isValid}>
        {isPending ? "отправка..." : "восстановить пароль"}
      </button>

      {status && <p className={styles.status}>{status}</p>}
    </form>
  );
}
