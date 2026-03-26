"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { reportClientError } from "@gafus/error-handling";

import { FormField } from "@shared/components/ui/FormField";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { useZodForm } from "@shared/hooks/useZodForm";
import { resetPasswordFormSchema } from "@shared/lib/validation/authSchemas";
import { resetPasswordAction } from "@shared/server-actions";

import styles from "./reset-password.module.css";

import type { ResetPasswordFormSchema } from "@shared/lib/validation/authSchemas";

interface ResetPasswordFormProps {
  initialToken: string;
}

export default function ResetPasswordForm({ initialToken }: ResetPasswordFormProps) {
  const router = useRouter();
  const {
    form,
    handleSubmit,
    formState: { errors },
  } = useZodForm(resetPasswordFormSchema, {
    token: initialToken,
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (data: ResetPasswordFormSchema) => {
    setError("");
    setIsPending(true);
    try {
      await resetPasswordAction(data.token, data.password);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: unknown) {
      reportClientError(err, {
        issueKey: "ResetPasswordForm",
        keys: { operation: "reset_password_by_token" },
      });
      setError(err instanceof Error ? err.message : "Ошибка сброса пароля");
    } finally {
      setIsPending(false);
    }
  };

  if (success) {
    return (
      <p className={styles.status}>
        Пароль обновлён. Перенаправление на страницу входа...
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      {initialToken ? (
        <input type="hidden" {...form.register("token")} />
      ) : (
        <FormField
          id="token"
          label="Токен из письма"
          name="token"
          type="text"
          placeholder="Вставьте значение из ссылки в письме"
          form={form}
          visuallyHiddenLabel
          className={styles.input}
          errorClassName={styles.errorText}
        />
      )}
      {initialToken ? (
        <p className={styles.subtitle}>
          Ссылка из письма применена. Укажите новый пароль.
        </p>
      ) : null}
      <PasswordInput
        placeholder="Новый пароль"
        label="Новый пароль"
        visuallyHiddenLabel
        className={styles.input}
        errorClassName={styles.errorText}
        autoComplete="new-password"
        {...form.register("password")}
        error={errors.password?.message}
      />
      <PasswordInput
        placeholder="Повторите пароль"
        label="Повторите пароль"
        visuallyHiddenLabel
        className={styles.input}
        errorClassName={styles.errorText}
        autoComplete="new-password"
        {...form.register("confirmPassword")}
        error={errors.confirmPassword?.message}
      />
      <button
        className={styles.button}
        type="submit"
        disabled={isPending}
      >
        {isPending ? "Сохранение..." : "Сохранить"}
      </button>
      {error && <p className={styles.errorText}>{error}</p>}
    </form>
  );
}
