"use client";

import { FormField } from "@shared/components/ui/FormField";
import { useZodForm } from "@shared/hooks/useZodForm";
import { phoneSchema } from "@shared/lib/validation/authSchemas";
import { setVkPhoneAction } from "@shared/server-actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

const schema = z.object({ phone: phoneSchema });

export default function SetVkPhoneForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const { form, handleSubmit } = useZodForm(schema, { phone: "" });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setError("");
    try {
      const result = await setVkPhoneAction(data.phone);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/profile");
    } catch {
      setError("Не удалось установить номер");
    }
  };

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "2rem" }}>
      <h1>Номер телефона</h1>
      <p style={{ marginBottom: "1rem", color: "var(--mui-palette-text-secondary)" }}>
        Введите ваш номер телефона для завершения регистрации через VK.
      </p>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          id="phone"
          label="Номер телефона"
          name="phone"
          type="tel"
          placeholder="+7 (999) 123-45-67"
          form={form}
          className="mb-4 w-full"
        />
        <button type="submit">Сохранить</button>
        {error && (
          <p style={{ color: "var(--mui-palette-error-main)", marginTop: "1rem" }}>{error}</p>
        )}
      </form>
    </main>
  );
}
