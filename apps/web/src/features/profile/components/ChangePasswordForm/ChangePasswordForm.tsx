"use client";

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { reportClientError } from "@gafus/error-handling";
import { useZodForm } from "@shared/hooks/useZodForm";
import { changePasswordSchema } from "@shared/lib/validation/authSchemas";
import { changePasswordAction } from "@shared/server-actions";

import type { z } from "zod";

import styles from "./ChangePasswordForm.module.css";

type ChangePasswordSchema = z.infer<typeof changePasswordSchema>;

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

export default function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { form, handleSubmit, formState: { errors } } = useZodForm(changePasswordSchema, {
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });

  const onSubmit = async (data: ChangePasswordSchema) => {
    setError("");
    setIsSubmitting(true);
    try {
      const result = await changePasswordAction(data.currentPassword, data.newPassword);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/profile");
    } catch (err) {
      reportClientError(err, { issueKey: "ChangePasswordForm", keys: { operation: "submit" } });
      setError("Не удалось сменить пароль");
    } finally {
      setIsSubmitting(false);
    }
  };

  const rCurrent = form.register("currentPassword");
  const rNew = form.register("newPassword");
  const rConfirm = form.register("confirmNewPassword");

  const adornment = (visible: boolean, toggle: () => void, id: string) => (
    <InputAdornment position="end">
      <IconButton
        aria-controls={id}
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        onClick={() => toggle()}
        onMouseDown={(e) => e.preventDefault()}
        edge="end"
        size="small"
        tabIndex={-1}
        sx={{ color: "#636128" }}
      >
        {visible ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="change-password-title">
        <div className={styles.iconWrap} aria-hidden>
          <LockOutlinedIcon sx={{ fontSize: 28 }} />
        </div>
        <h1 id="change-password-title" className={styles.title}>
          Смена пароля
        </h1>
        <p className={styles.lead}>
          Введите текущий пароль и новый. Минимум 8 символов: заглавная и строчная буквы, цифра.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={styles.fields}>
            <TextField
              id="currentPassword"
              label="Текущий пароль"
              type={showCurrent ? "text" : "password"}
              autoComplete="current-password"
              fullWidth
              disabled={isSubmitting}
              error={!!errors.currentPassword}
              helperText={errors.currentPassword?.message}
              inputRef={rCurrent.ref}
              name={rCurrent.name}
              onBlur={rCurrent.onBlur}
              onChange={rCurrent.onChange}
              slotProps={{
                input: {
                  id: "currentPassword-input",
                  endAdornment: adornment(showCurrent, () => setShowCurrent((v) => !v), "currentPassword-input"),
                },
              }}
              sx={textFieldSx}
            />
            <TextField
              id="newPassword"
              label="Новый пароль"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              fullWidth
              disabled={isSubmitting}
              error={!!errors.newPassword}
              helperText={errors.newPassword?.message}
              inputRef={rNew.ref}
              name={rNew.name}
              onBlur={rNew.onBlur}
              onChange={rNew.onChange}
              slotProps={{
                input: {
                  id: "newPassword-input",
                  endAdornment: adornment(showNew, () => setShowNew((v) => !v), "newPassword-input"),
                },
              }}
              sx={textFieldSx}
            />
            <TextField
              id="confirmNewPassword"
              label="Повторите новый пароль"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              fullWidth
              disabled={isSubmitting}
              error={!!errors.confirmNewPassword}
              helperText={errors.confirmNewPassword?.message}
              inputRef={rConfirm.ref}
              name={rConfirm.name}
              onBlur={rConfirm.onBlur}
              onChange={rConfirm.onChange}
              slotProps={{
                input: {
                  id: "confirmNewPassword-input",
                  endAdornment: adornment(
                    showConfirm,
                    () => setShowConfirm((v) => !v),
                    "confirmNewPassword-input",
                  ),
                },
              }}
              sx={textFieldSx}
            />
          </div>
          {error ? <p className={styles.errorBox}>{error}</p> : null}
          <button type="submit" className={styles.submit} disabled={isSubmitting}>
            {isSubmitting ? "Сохранение…" : "Сохранить"}
          </button>
        </form>
      </section>
    </main>
  );
}
