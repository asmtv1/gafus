"use client";

import { useState } from "react";
import { sendTelegramPasswordResetRequest } from "@/lib/auth/sendTelegramPasswordResetRequest";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export function PasswordResetClient() {
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [caughtError, setCaughtError] = useState<Error | null>(null);
  const [phoneError, setPhoneError] = useState("");

  if (caughtError) {
    throw caughtError;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneNumberObj = parsePhoneNumberFromString(phone, "RU");
    if (!phoneNumberObj?.isValid()) {
      setPhoneError("Неверный формат телефона");
      return;
    }

    setPhoneError("");
    try {
      await sendTelegramPasswordResetRequest(username, phone);
      setStatus("Если данные верны, вам придёт сообщение в Telegram");
    } catch (error) {
      setCaughtError(error as Error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Логин:
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      </label>
      <label>
        Телефон:
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          style={{ width: "100%", marginBottom: "1rem" }}
        />
        {phoneError && (
          <p style={{ color: "red", marginBottom: "1rem" }}>{phoneError}</p>
        )}
      </label>
      <button type="submit">Отправить</button>
      {status && <p style={{ marginTop: "1rem" }}>{status}</p>}
    </form>
  );
}
