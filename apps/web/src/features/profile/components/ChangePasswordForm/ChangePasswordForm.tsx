"use client";

import { PasswordInput } from "@shared/components/ui/PasswordInput";
import { useZodForm } from "@shared/hooks/useZodForm";
import { changePasswordSchema } from "@shared/lib/validation/authSchemas";
import { changePasswordAction } from "@shared/server-actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { z } from "zod";

type ChangePasswordSchema = z.infer<typeof changePasswordSchema>;

export default function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const { form, handleSubmit, formState: { errors } } = useZodForm(changePasswordSchema, {
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });

  const onSubmit = async (data: ChangePasswordSchema) => {
    setError("");
    try {
      const result = await changePasswordAction(data.currentPassword, data.newPassword);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/profile");
    } catch {
      setError("Не удалось сменить пароль");
    }
  };

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "2rem" }}>
      <h1>Смена пароля</h1>
      <p style={{ marginBottom: "1rem", color: "var(--mui-palette-text-secondary)" }}>
        Введите текущий пароль и новый пароль.
      </p>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-4">
          <PasswordInput
            placeholder="Текущий пароль"
            label="Текущий пароль"
            visuallyHiddenLabel
            className="w-full"
            errorClassName="text-red-600 mt-1"
            autoComplete="current-password"
            {...form.register("currentPassword")}
            error={errors.currentPassword?.message}
          />
        </div>
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
            placeholder="Повторите новый пароль"
            label="Повторите новый пароль"
            visuallyHiddenLabel
            className="w-full"
            errorClassName="text-red-600 mt-1"
            autoComplete="new-password"
            {...form.register("confirmNewPassword")}
            error={errors.confirmNewPassword?.message}
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
