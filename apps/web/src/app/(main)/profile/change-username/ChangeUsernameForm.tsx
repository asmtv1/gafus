"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { reportClientError } from "@gafus/error-handling";
import { FormField } from "@shared/components/ui/FormField";
import { useZodForm } from "@shared/hooks/useZodForm";
import { usernameChangeSchema } from "@shared/lib/validation/authSchemas";
import { changeUsernameAction, checkUsernameAvailableAction } from "@shared/server-actions";

import type { UsernameChangeSchema } from "@shared/lib/validation/authSchemas";

import styles from "./ChangeUsernameForm.module.css";

type Availability = "idle" | "checking" | "available" | "taken";

export default function ChangeUsernameForm() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortRef = useRef(0);

  const { form, handleSubmit } = useZodForm(usernameChangeSchema, { newUsername: "" });
  const watchedUsername = form.watch("newUsername");

  useEffect(() => {
    const trimmed = watchedUsername?.trim() ?? "";
    if (trimmed.length < 3 || !/^[A-Za-z0-9_]+$/.test(trimmed)) {
      setAvailability("idle");
      return;
    }

    setAvailability("checking");
    const requestId = ++abortRef.current;

    const timer = setTimeout(async () => {
      const result = await checkUsernameAvailableAction(trimmed);
      if (abortRef.current !== requestId) return;
      if ("available" in result) {
        setAvailability(result.available ? "available" : "taken");
      } else {
        setAvailability("idle");
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [watchedUsername]);

  const onSubmit = async (data: UsernameChangeSchema) => {
    setError("");
    setIsSubmitting(true);
    try {
      const result = await changeUsernameAction(data.newUsername);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.success && result.username) {
        await updateSession({ username: result.username });
        router.push(`/profile?username=${result.username}`);
      }
    } catch (err) {
      reportClientError(err, { issueKey: "ChangeUsernameForm", keys: { operation: "submit" } });
      setError("Не удалось сменить логин");
    } finally {
      setIsSubmitting(false);
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
          ariaDescribedBy="username-availability-hint"
        />
        <div
          id="username-availability-hint"
          role="status"
          aria-live="polite"
          className={styles.availabilityHint}
        >
          {availability === "checking" && (
            <span style={{ color: "var(--mui-palette-text-secondary)" }}>Проверка...</span>
          )}
          {availability === "available" && (
            <span style={{ color: "var(--mui-palette-success-main)" }}>Логин свободен</span>
          )}
          {availability === "taken" && (
            <span style={{ color: "var(--mui-palette-error-main)" }}>Логин занят</span>
          )}
        </div>
        {error && (
          <p style={{ color: "var(--mui-palette-error-main)", marginTop: "0.5rem" }}>{error}</p>
        )}
        <button
          type="submit"
          className={styles.button}
          disabled={availability === "taken" || availability === "checking" || isSubmitting}
        >
          {isSubmitting ? "Сохранение..." : "Сохранить"}
        </button>
      </form>
    </main>
  );
}
