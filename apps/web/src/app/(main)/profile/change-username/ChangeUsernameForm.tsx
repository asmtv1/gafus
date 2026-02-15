"use client";

import { FormField } from "@shared/components/ui/FormField";
import { useZodForm } from "@shared/hooks/useZodForm";
import { usernameChangeSchema } from "@shared/lib/validation/authSchemas";
import { changeUsernameAction } from "@shared/server-actions";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";

import type { UsernameChangeSchema } from "@shared/lib/validation/authSchemas";

export default function ChangeUsernameForm() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [error, setError] = useState("");

  const { form, handleSubmit } = useZodForm(usernameChangeSchema, {
    newUsername: "",
  });

  const onSubmit = async (data: UsernameChangeSchema) => {
    setError("");
    try {
      const result = await changeUsernameAction(data.newUsername);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.success && result.username) {
        await updateSession({ username: result.username });
      }
      router.push("/profile");
    } catch {
      setError("Не удалось сменить логин");
    }
  };

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "2rem" }}>
      <h1>Смена логина</h1>
      <p style={{ marginBottom: "1rem", color: "var(--mui-palette-text-secondary)" }}>
        Логин используется для входа. Минимум 3 символа, только латинские буквы, цифры и _.
      </p>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          id="newUsername"
          label="Новый логин"
          name="newUsername"
          type="text"
          placeholder="mylogin"
          form={form}
          className="mb-4 w-full"
        />
        <button type="submit">Сохранить</button>
        {error && <p style={{ color: "var(--mui-palette-error-main)", marginTop: "1rem" }}>{error}</p>}
      </form>
    </main>
  );
}
