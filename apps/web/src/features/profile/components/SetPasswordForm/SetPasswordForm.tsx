"use client";

import { reportClientError } from "@gafus/error-handling";
import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { useZodForm } from "@shared/hooks/useZodForm";
import { setPasswordSchema } from "@shared/lib/validation/authSchemas";
import { setPasswordAction } from "@shared/server-actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { z } from "zod";

type SetPasswordSchema = z.infer<typeof setPasswordSchema>;

export default function SetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const { form, handleSubmit, formState: { errors } } = useZodForm(setPasswordSchema, {
    newPassword: "",
    confirmPassword: "",
  });

  const onSubmit = async (data: SetPasswordSchema) => {
    setError("");
    try {
      const result = await setPasswordAction(data.newPassword);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/profile");
    } catch (err) {
      reportClientError(err, { issueKey: "SetPasswordForm", keys: { operation: "submit" } });
      setError("Не удалось установить пароль");
    }
  };

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "2rem" }}>
      <h1>Установка пароля</h1>
      <p style={{ marginBottom: "1rem", color: "var(--mui-palette-text-secondary)" }}>
        Установите пароль для входа через логин. Минимум 8 символов, заглавная и строчная буквы,
        цифра.
      </p>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-4">
          <PasswordInput
            placeholder="Новый пароль"
            label="Новый пароль"
            visuallyHiddenLabel
            className="w-full"
            errorClassName="text-red-600 mt-1"
            autoComplete="new-password"
            {...form.register("newPassword")}
            error={errors.newPassword?.message}
          />
        </div>
        <div className="mb-4">
          <PasswordInput
            placeholder="Повторите пароль"
            label="Повторите пароль"
            visuallyHiddenLabel
            className="w-full"
            errorClassName="text-red-600 mt-1"
            autoComplete="new-password"
            {...form.register("confirmPassword")}
            error={errors.confirmPassword?.message}
          />
        </div>
        <button type="submit">Сохранить</button>
        {error && (
          <p style={{ color: "var(--mui-palette-error-main)", marginTop: "1rem" }}>{error}</p>
        )}
      </form>
    </main>
  );
}
