"use client";

import { FormField } from "@shared/components/ui/FormField";
import { useZodForm } from "@shared/hooks/useZodForm";
import { phoneChangeConfirmSchema } from "@shared/lib/validation/authSchemas";
import { confirmPhoneChangeAction, requestPhoneChangeAction } from "@shared/server-actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PhoneChangeConfirmSchema } from "@shared/lib/validation/authSchemas";

export default function ChangePhoneForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [requestError, setRequestError] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const { form, handleSubmit } = useZodForm(phoneChangeConfirmSchema, {
    code: "",
    newPhone: "",
  });

  const onRequestCode = async () => {
    setRequestError("");
    setRequestLoading(true);
    try {
      const result = await requestPhoneChangeAction();
      if (result.error) {
        setRequestError(result.error);
        return;
      }
      setStep(2);
    } finally {
      setRequestLoading(false);
    }
  };

  const onSubmit = async (data: PhoneChangeConfirmSchema) => {
    setFormError("");
    try {
      const result = await confirmPhoneChangeAction(data.code, data.newPhone);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      router.push("/profile");
    } catch {
      setFormError("Не удалось сменить номер");
    }
  };

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: "2rem" }}>
      <h1>Смена номера телефона</h1>

      {step === 1 && (
        <>
          <p style={{ marginBottom: "1rem", color: "var(--mui-palette-text-secondary)" }}>
            Код подтверждения будет отправлен в Telegram, привязанный к аккаунту.
          </p>
          <button type="button" onClick={onRequestCode} disabled={requestLoading}>
            {requestLoading ? "Отправка…" : "Отправить код в Telegram"}
          </button>
          {requestError && <p style={{ color: "var(--mui-palette-error-main)", marginTop: "1rem" }}>{requestError}</p>}
        </>
      )}

      {step === 2 && (
        <>
          <p style={{ marginBottom: "1rem", color: "var(--mui-palette-text-secondary)" }}>
            Введите 6-значный код из Telegram и новый номер телефона.
          </p>
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
              id="newPhone"
              label="Новый номер телефона"
              name="newPhone"
              type="tel"
              placeholder="+7 (999) 123-45-67"
              form={form}
              className="mb-4 w-full"
            />
            <button type="submit">Подтвердить</button>
            {formError && <p style={{ color: "var(--mui-palette-error-main)", marginTop: "1rem" }}>{formError}</p>}
          </form>
        </>
      )}
    </main>
  );
}
