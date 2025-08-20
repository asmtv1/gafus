"use client";

import resetPasswordByToken from "@shared/lib/auth/login-utils";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Ссылка недействительна.");
      return;
    }

    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }

    try {
      await resetPasswordByToken(token, password);
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
        <form onSubmit={handleSubmit}>
          <label>
            Новый пароль:
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          </label>
          <label>
            Повторите пароль:
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          </label>
          <button type="submit">Сохранить</button>
          {error && <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>}
        </form>
      ) : (
        <p>Пароль обновлён. Перенаправление...</p>
      )}
    </main>
  );
}
