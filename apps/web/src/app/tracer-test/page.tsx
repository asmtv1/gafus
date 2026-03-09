"use client";

import { reportClientError } from "@gafus/error-handling";
import { useEffect, useState } from "react";

/**
 * Тестовая страница для проверки интеграции Tracer.
 * Открой /tracer-test?trigger=1 чтобы отправить тестовую ошибку в apptracer.ru
 */
export default function TracerTestPage() {
  const [sent, setSent] = useState(false);
  const [showTrigger, setShowTrigger] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setShowTrigger(params.get("trigger") === "1");
    if (params.get("trigger") !== "1") return;

    const timer = setTimeout(() => {
      reportClientError(
        new Error("Test: Tracer trigger from GAFUS (tracer-test page)"),
        { issueKey: "TracerTest", keys: { source: "tracer-test-page" } }
      );
      setSent(true);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui", maxWidth: "480px" }}>
      <h1>Tracer Test</h1>
      <p>
        Открой страницу с параметром{" "}
        <code>?trigger=1</code>, чтобы отправить тестовую ошибку в Tracer.
      </p>
      {showTrigger && (
        <p style={{ color: sent ? "green" : "gray" }}>
          {sent ? "✓ Отправлено" : "Ожидание инициализации SDK…"}
        </p>
      )}
      <p style={{ marginTop: "2rem", fontSize: "0.875rem", color: "#666" }}>
        <a href="/tracer-test?trigger=1">/tracer-test?trigger=1</a>
      </p>
    </div>
  );
}
