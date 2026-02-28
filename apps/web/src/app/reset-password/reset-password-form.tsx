"use client";

import { FormField } from "@shared/components/ui/FormField";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { useZodForm } from "@shared/hooks/useZodForm";
import { resetPasswordByCodeAction } from "@shared/server-actions";
import { resetPasswordFormSchema } from "@shared/lib/validation/authSchemas";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./reset-password.module.css";

import type { ResetPasswordFormSchema } from "@shared/lib/validation/authSchemas";

export default function ResetPasswordForm() {
  const router = useRouter();
  const {
    form,
    handleSubmit,
    formState: { errors },
  } = useZodForm(resetPasswordFormSchema, {
    code: "",
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
      await resetPasswordByCodeAction(data.code, data.password);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: unknown) {
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
      <FormField
        id="code"
        label="Код из Telegram"
        name="code"
        type="text"
        placeholder="123456"
        form={form}
        visuallyHiddenLabel
        className={styles.input}
        errorClassName={styles.errorText}
      />
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
