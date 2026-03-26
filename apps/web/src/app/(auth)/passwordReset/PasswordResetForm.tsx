"use client";

import Link from "next/link";
import { useState } from "react";

import { reportClientError } from "@gafus/error-handling";

import { EmailField } from "@shared/components/ui/FormField";
import { useZodForm } from "@shared/hooks/useZodForm";
import { passwordResetFormSchema } from "@shared/lib/validation/authSchemas";
import { sendPasswordResetRequestAction } from "@shared/server-actions";

import styles from "./passwordReset.module.css";

import type { PasswordResetFormSchema } from "@shared/lib/validation/authSchemas";

export function PasswordResetForm() {
  const {
    form,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isValid },
  } = useZodForm(passwordResetFormSchema, {
    email: "",
  });

  const [isPending, setIsPending] = useState(false);
  const [status, setStatus] = useState("");

  const onSubmit = async (data: PasswordResetFormSchema) => {
    clearErrors();
    setIsPending(true);

    try {
      await sendPasswordResetRequestAction(data.email);
      setStatus(
        "Если аккаунт с таким email есть, на него отправлено письмо со ссылкой для сброса пароля.",
      );
    } catch (error) {
      reportClientError(error, {
        issueKey: "PasswordResetForm",
        keys: { operation: "password_reset_request" },
      });
      setError("root", {
        message:
          error instanceof Error ? error.message : "Ошибка отправки запроса. Попробуйте позже.",
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
      <EmailField
        id="email"
        label="Email"
        visuallyHiddenLabel
        name="email"
        placeholder="Email"
        autoComplete="email"
        className={styles.input}
        form={form}
        errorClassName={styles.errorText}
      />

      <button className={styles.button} type="submit" disabled={isPending || !isValid}>
        {isPending ? "отправка..." : "восстановить пароль"}
      </button>

      {status && (
        <>
          <p className={styles.status}>{status}</p>
          <Link href="/reset-password" className={styles.linkButton}>
            Уже есть ссылка — ввести новый пароль
          </Link>
        </>
      )}
    </form>
  );
}
