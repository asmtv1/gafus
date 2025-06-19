"use client";

import { useForm } from "react-hook-form";
import { sendTelegramPasswordResetRequest } from "@/lib/auth/sendTelegramPasswordResetRequest";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useState } from "react";

type FormData = {
  username: string;
  phone: string;
};

export function PasswordResetClient() {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
  } = useForm<FormData>();

  const [status, setStatus] = useState("");
  const [caughtError, setCaughtError] = useState<Error | null>(null);

  if (caughtError) {
    throw caughtError;
  }

  const onSubmit = async (data: FormData) => {
    const phoneNumberObj = parsePhoneNumberFromString(data.phone, "RU");

    if (!phoneNumberObj?.isValid()) {
      setError("phone", { message: "Неверный формат телефона" });
      return;
    }

    clearErrors("phone");

    try {
      await sendTelegramPasswordResetRequest(data.username, data.phone);
      setStatus("Если данные верны, вам придёт сообщение в Telegram");
    } catch (error) {
      setCaughtError(error as Error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <label>
        Логин:
        <input
          type="text"
          {...register("username", { required: "Обязательное поле" })}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
        {errors.username && (
          <p style={{ color: "red", marginBottom: "1rem" }}>
            {errors.username.message}
          </p>
        )}
      </label>

      <label>
        Телефон:
        <input
          type="tel"
          {...register("phone", { required: "Обязательное поле" })}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
        {errors.phone && (
          <p style={{ color: "red", marginBottom: "1rem" }}>
            {errors.phone.message}
          </p>
        )}
      </label>

      <button type="submit">Отправить</button>

      {status && <p style={{ marginTop: "1rem" }}>{status}</p>}
    </form>
  );
}
