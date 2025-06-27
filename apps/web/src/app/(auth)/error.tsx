// app/(auth)/error.tsx
"use client";

import { useEffect } from "react";

export default function MainErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Ошибка в (auth):", error);
  }, [error]);

  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h1>⚠ Ошибка</h1>
      <p>
        Что-то пошло не так. Попробуйте обновить страницу или вернитесь позже.
      </p>
      <pre style={{ color: "gray", marginTop: 20 }}>{error.message}</pre>
      <button
        style={{ marginTop: 20, padding: "8px 16px", cursor: "pointer" }}
        onClick={() => reset()}
      >
        Перезагрузить сегмент
      </button>
    </div>
  );
}
