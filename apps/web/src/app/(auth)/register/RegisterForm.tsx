"use client";

import { FormField, TextField } from "@shared/components/ui/FormField";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { commonValidationRules } from "@shared/hooks/useFormValidation";
import { registerUserAction } from "@shared/lib/auth/login-utils";
import parsePhoneNumberFromString from "libphonenumber-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import styles from "./register.module.css";

import type { RegisterFormData as FormData } from "@gafus/types";

export function RegisterForm() {
  const router = useRouter();

  const form = useForm<FormData>({
    mode: "onBlur",
    defaultValues: {
      name: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const {
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isValid },
  } = form;

  const [isPending, setIsPending] = useState(false);
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
    const phoneNumber = parsePhoneNumberFromString(data.phone, "RU");

    if (!phoneNumber || !phoneNumber.isValid()) {
      setError("phone", { message: "Неверный номер телефона" });
      return;
    }

    const formattedPhone = phoneNumber.format("E.164");
    setIsPending(true);
    try {
      const result = await registerUserAction(
        data.name.toLowerCase(),
        formattedPhone,
        data.password,
      );

      if (result?.error) {
        if (result.error.includes("телефон")) {
          setError("phone", { message: result.error });
        } else {
          alert(result.error);
        }
        setIsPending(false);
      } else {
        router.push(`/confirm?phone=${encodeURIComponent(formattedPhone)}`);
      }
    } catch (error) {
      setCaughtError(error as Error);
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
        form={form}
        errorClassName={styles.errorText}
        rules={{
          ...commonValidationRules.name,
          required: "Введите имя пользователя",
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

      <p className={styles.info}>Требуется Подтверждение через Telegram</p>

      <PasswordInput
        className={styles.input}
        label="Пароль"
        visuallyHiddenLabel
        placeholder="Пароль"
        autoComplete="new-password"
        {...form.register("password", {
          ...commonValidationRules.password,
          required: "Введите пароль",
          maxLength: { value: 12, message: "Максимум 12 символов" },
          pattern: {
            value: /^[A-Za-z0-9]+$/,
            message: "Только английские буквы или цифры",
          },
        })}
        error={errors.password?.message}
        errorClassName={styles.errorText}
      />

      <PasswordInput
        className={styles.input}
        label="Повторите пароль"
        placeholder="Повторите пароль"
        visuallyHiddenLabel
        {...form.register("confirmPassword", {
          required: "Повторите пароль",
          validate: (value) => value === getValues("password") || "Пароли не совпадают",
        })}
        error={errors.confirmPassword?.message}
        errorClassName={styles.errorText}
      />

      <button className={styles.button} type="submit" disabled={isPending || !isValid}>
        {isPending ? "регистрация..." : "зарегистрироваться"}
      </button>
    </form>
  );
}
