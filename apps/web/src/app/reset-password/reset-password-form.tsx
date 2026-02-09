"use client";

import { FormField } from "@shared/components/ui/FormField";
import { useZodForm } from "@shared/hooks/useZodForm";
import { resetPasswordByCodeAction } from "@shared/server-actions";
import { resetPasswordFormSchema } from "@shared/lib/validation/authSchemas";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ResetPasswordFormSchema } from "@shared/lib/validation/authSchemas";

export default function ResetPasswordForm() {
  const router = useRouter();

  const { form, handleSubmit } = useZodForm(resetPasswordFormSchema, {
    code: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const onSubmit = async (data: ResetPasswordFormSchema) => {
    setError("");

    try {
      await resetPasswordByCodeAction(data.code, data.password);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка сброса пароля");
    }
  };

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "2rem" }}>
      <h1>Сброс пароля</h1>
      <p style={{ marginBottom: "1rem", color: "var(--mui-palette-text-secondary)" }}>
        Введите 6-значный код из сообщения в Telegram и новый пароль.
      </p>
      {!success ? (
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormField
            id="code"
            label="Код из Telegram"
            name="code"
            type="text"
            placeholder="123456"
            form={form}
            className="mb-4 w-full"
          />
          <FormField
            id="password"
            label="Новый пароль"
            name="password"
            type="password"
            placeholder="Новый пароль"
            form={form}
            className="mb-4 w-full"
          />
          <FormField
            id="confirmPassword"
            label="Повторите пароль"
            name="confirmPassword"
            type="password"
            placeholder="Повторите пароль"
            form={form}
            className="mb-4 w-full"
          />
          <button type="submit">Сохранить</button>
          {error && <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>}
        </form>
      ) : (
        <p>Пароль обновлён. Перенаправление на страницу входа...</p>
      )}
    </main>
  );
}
