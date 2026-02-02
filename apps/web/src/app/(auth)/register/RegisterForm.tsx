"use client";

import Link from "next/link";

import { FormField, TextField } from "@shared/components/ui/FormField";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { useZodForm } from "@shared/hooks/useZodForm";
import { registerUserAction } from "@shared/server-actions";
import { registerFormSchema } from "@shared/lib/validation/authSchemas";
import parsePhoneNumberFromString from "libphonenumber-js";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./register.module.css";

import type { RegisterFormSchema } from "@shared/lib/validation/authSchemas";

export function RegisterForm() {
  const router = useRouter();

  const {
    form,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useZodForm(registerFormSchema, {
    name: "",
    phone: "",
    password: "",
    confirmPassword: "",
    acceptUserAgreement: false,
    acceptOffer: false,
  });

  const [isPending, setIsPending] = useState(false);
  const [caughtError, setCaughtError] = useState<Error | null>(null);

  // Валидация телефона теперь обрабатывается Zod схемой

  if (caughtError) {
    throw caughtError;
  }

  const onSubmit = async (data: RegisterFormSchema) => {
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
        autoComplete="username"
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
        autoComplete="tel"
      />

      <p className={styles.info}>Требуется Подтверждение через Telegram</p>

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
          {...form.register("acceptUserAgreement")}
          aria-invalid={!!errors.acceptUserAgreement}
        />
        <span className={styles.checkboxLabel}>
          Я принимаю{" "}
          <Link href="/terms" className={styles.checkboxLink} target="_blank" rel="noopener noreferrer">
            пользовательское соглашение
          </Link>
        </span>
      </label>
      {errors.acceptUserAgreement?.message && (
        <span className={styles.errorText}>{errors.acceptUserAgreement.message}</span>
      )}

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          {...form.register("acceptOffer")}
          aria-invalid={!!errors.acceptOffer}
        />
        <span className={styles.checkboxLabel}>
          Я принимаю{" "}
          <Link href="/terms" className={styles.checkboxLink} target="_blank" rel="noopener noreferrer">
            условия оферты
          </Link>
        </span>
      </label>
      {errors.acceptOffer?.message && (
        <span className={styles.errorText}>{errors.acceptOffer.message}</span>
      )}

      <button className={styles.button} type="submit" disabled={isPending || !isValid}>
        {isPending ? "регистрация..." : "зарегистрироваться"}
      </button>
    </form>
  );
}
