"use client";

import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { reportClientError } from "@gafus/error-handling";
import { useZodForm } from "@shared/hooks/useZodForm";
import { emailChangeRequestFormSchema } from "@shared/lib/validation/authSchemas";
import { requestEmailChangeAction } from "@shared/server-actions";

import type { EmailChangeRequestFormSchema } from "@shared/lib/validation/authSchemas";

import styles from "./ChangeEmailForm.module.css";

interface ChangeEmailFormProps {
  username: string;
}

export default function ChangeEmailForm({ username }: ChangeEmailFormProps) {
  const router = useRouter();
  const [rootError, setRootError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { form, handleSubmit, formState: { errors } } = useZodForm(emailChangeRequestFormSchema, {
    newEmail: "",
  });

  const onSubmit = async (data: EmailChangeRequestFormSchema) => {
    setRootError("");
    setIsSubmitting(true);
    try {
      const result = await requestEmailChangeAction(data.newEmail);
      if (result.error) {
        setRootError(result.error);
        return;
      }
      router.push(
        `/profile?username=${encodeURIComponent(username)}&emailChange=sent`,
      );
    } catch (err) {
      reportClientError(err, { issueKey: "ChangeEmailForm", keys: { operation: "submit" } });
      setRootError("Не удалось отправить письмо. Попробуйте позже.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const { ref, ...emailField } = form.register("newEmail");

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="change-email-title">
        <div className={styles.iconWrap} aria-hidden>
          <EmailOutlinedIcon sx={{ fontSize: 28 }} />
        </div>
        <h1 id="change-email-title" className={styles.title}>
          Смена email
        </h1>
        <p className={styles.lead}>
          На новый адрес придёт письмо со ссылкой для подтверждения. Старый email останется активен,
          пока вы не перейдёте по ссылке.
        </p>
        <ul className={styles.steps}>
          <li>Введите новый адрес и нажмите «Отправить письмо».</li>
          <li>Откройте письмо и подтвердите смену по ссылке (ссылка действует ограниченное время).</li>
        </ul>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={styles.field}>
            <TextField
              inputRef={ref}
              {...emailField}
              id="newEmail"
              label="Новый email"
              type="email"
              placeholder="email@example.com"
              autoComplete="email"
              fullWidth
              error={!!errors.newEmail}
              helperText={errors.newEmail?.message}
              disabled={isSubmitting}
              slotProps={{
                inputLabel: { shrink: true },
              }}
              sx={{
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
              }}
            />
          </div>
          {rootError ? <p className={styles.errorBox}>{rootError}</p> : null}
          <button type="submit" className={styles.submit} disabled={isSubmitting}>
            {isSubmitting ? "Отправка…" : "Отправить письмо"}
          </button>
        </form>
      </section>
    </main>
  );
}
