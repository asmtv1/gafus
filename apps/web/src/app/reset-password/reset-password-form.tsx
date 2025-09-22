"use client";

import { FormField } from "@shared/components/ui/FormField";
import { useZodForm } from "@shared/hooks/useZodForm";
import resetPasswordByToken from "@shared/lib/auth/login-utils";
import { resetPasswordFormSchema } from "@shared/lib/validation/authSchemas";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

import type { ResetPasswordFormSchema } from "@shared/lib/validation/authSchemas";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();

  const { form, handleSubmit } = useZodForm(
    resetPasswordFormSchema,
    {
      password: "",
      confirmPassword: "",
    }
  );

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const onSubmit = async (data: ResetPasswordFormSchema) => {
    setError("");

    if (!token) {
      setError("Ссылка недействительна.");
      return;
    }

    try {
      await resetPasswordByToken(token, data.password);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка сброса пароля");
    }
  };

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "2rem" }}>
      <h1>Новый пароль</h1>
      {!success ? (
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormField
            id="password"
            label="Новый пароль"
            name="password"
            type="password"
            placeholder="Новый пароль"
            form={form}
            className="w-full mb-4"
          />
          <FormField
            id="confirmPassword"
            label="Повторите пароль"
            name="confirmPassword"
            type="password"
            placeholder="Повторите пароль"
            form={form}
            className="w-full mb-4"
          />
          <button type="submit">Сохранить</button>
          {error && <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>}
        </form>
      ) : (
        <p>Пароль обновлён. Перенаправление...</p>
      )}
    </main>
  );
}
