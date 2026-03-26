"use client";

import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { reportClientError } from "@gafus/error-handling";
import { useZodForm } from "@shared/hooks/useZodForm";
import { usernameChangeSchema } from "@shared/lib/validation/authSchemas";
import { changeUsernameAction, checkUsernameAvailableAction } from "@shared/server-actions";

import type { UsernameChangeSchema } from "@shared/lib/validation/authSchemas";

import styles from "./ChangeUsernameForm.module.css";

type Availability = "idle" | "checking" | "available" | "taken";

const textFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    backgroundColor: "#fff",
    fontFamily: "var(--font-montserrat), system-ui, sans-serif",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "#636128",
    borderWidth: "1px",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "#4a4a1a",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#636128",
    borderWidth: "2px",
  },
  "& .MuiInputLabel-root": {
    color: "#5a5744",
    fontFamily: "var(--font-montserrat), system-ui, sans-serif",
  },
  "& .MuiFormHelperText-root": {
    fontFamily: "var(--font-montserrat), system-ui, sans-serif",
  },
} as const;

export default function ChangeUsernameForm() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [rootError, setRootError] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortRef = useRef(0);

  const {
    form,
    handleSubmit,
    formState: { errors },
  } = useZodForm(usernameChangeSchema, { newUsername: "" });
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
    setRootError("");
    setIsSubmitting(true);
    try {
      const result = await changeUsernameAction(data.newUsername);
      if (result.error) {
        setRootError(result.error);
        return;
      }
      if (result.success && result.username) {
        await updateSession({ username: result.username });
        router.push(`/profile?username=${result.username}`);
      }
    } catch (err) {
      reportClientError(err, { issueKey: "ChangeUsernameForm", keys: { operation: "submit" } });
      setRootError("Не удалось сменить логин");
    } finally {
      setIsSubmitting(false);
    }
  };

  const { ref, ...usernameField } = form.register("newUsername");

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="change-username-title">
        <div className={styles.iconWrap} aria-hidden>
          <PersonOutlineIcon sx={{ fontSize: 28 }} />
        </div>
        <h1 id="change-username-title" className={styles.title}>
          Смена логина
        </h1>
        <p className={styles.lead}>
          Логин используется для входа. Минимум 3 символа: только латинские буквы, цифры и символ
          подчёркивания.
        </p>
        <ul className={styles.steps}>
          <li>Введите желаемый логин — покажем, свободен ли он.</li>
          <li>Нажмите «Сохранить», чтобы применить изменение.</li>
        </ul>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={styles.field}>
            <TextField
              inputRef={ref}
              {...usernameField}
              id="newUsername"
              label="Новый логин"
              type="text"
              placeholder="mylogin"
              autoComplete="username"
              fullWidth
              error={!!errors.newUsername}
              helperText={errors.newUsername?.message}
              disabled={isSubmitting}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: {
                  "aria-describedby": "username-availability-hint",
                },
              }}
              sx={textFieldSx}
            />
          </div>
          <div
            id="username-availability-hint"
            role="status"
            aria-live="polite"
            className={styles.availabilityHint}
          >
            {availability === "checking" ? (
              <span className={styles.availabilityChecking}>Проверка…</span>
            ) : null}
            {availability === "available" ? (
              <span className={styles.availabilityAvailable}>Логин свободен</span>
            ) : null}
            {availability === "taken" ? (
              <span className={styles.availabilityTaken}>Логин занят</span>
            ) : null}
          </div>
          {rootError ? <p className={styles.errorBox}>{rootError}</p> : null}
          <button
            type="submit"
            className={styles.submit}
            disabled={isSubmitting || availability === "taken"}
          >
            {isSubmitting ? "Сохранение…" : "Сохранить"}
          </button>
        </form>
      </section>
    </main>
  );
}
