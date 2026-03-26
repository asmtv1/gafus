"use client";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import TextField from "@mui/material/TextField";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { reportClientError } from "@gafus/error-handling";
import { profilePagePath } from "@shared/lib/profile/profilePagePath";
import {
  requestAccountDeletionCodeAction,
  submitDeleteUserAccount,
  type DeleteUserAccountActionState,
} from "@shared/lib/user/deleteUserAccount";

import styles from "./DeleteAccountForm.module.css";

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
} as const;

const initialDeleteState: DeleteUserAccountActionState = { success: false, error: "" };

interface DeleteAccountFormProps {
  userEmail: string | null;
  username: string;
}

export default function DeleteAccountForm({ userEmail, username }: DeleteAccountFormProps) {
  const backToProfileHref = profilePagePath(username);
  const [state, formAction, isPending] = useActionState(submitDeleteUserAccount, initialDeleteState);
  const [isRequesting, startTransition] = useTransition();
  const [requestOk, setRequestOk] = useState<string | null>(null);
  const [requestErr, setRequestErr] = useState<string | null>(null);

  const emailTrimmed = userEmail?.trim() ?? "";

  const handleRequestCode = () => {
    setRequestOk(null);
    setRequestErr(null);
    startTransition(async () => {
      try {
        const r = await requestAccountDeletionCodeAction();
        if (r.success) {
          setRequestOk(r.message ?? "Код отправлен на email.");
        } else {
          setRequestErr(r.error);
        }
      } catch (err) {
        reportClientError(err, { issueKey: "DeleteAccountForm", keys: { operation: "requestCode" } });
        setRequestErr("Не удалось отправить код");
      }
    });
  };

  if (!emailTrimmed) {
    return (
      <main className={styles.page}>
        <Link href={backToProfileHref} className={styles.backLink}>
          ← В профиль
        </Link>
        <section className={`${styles.card} ${styles.noEmailCard}`} aria-labelledby="delete-account-no-email">
          <h1 id="delete-account-no-email" className={styles.title}>
            Удаление аккаунта
          </h1>
          <p className={styles.lead}>
            Чтобы подтвердить удаление кодом из письма, сначала укажите email в профиле.
          </p>
          <Link href="/profile/change-email" className={styles.changeEmailLink}>
            Указать или сменить email
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Link href={backToProfileHref} className={styles.backLink}>
        ← В профиль
      </Link>
      <section className={styles.card} aria-labelledby="delete-account-title">
        <div className={styles.iconWrap} aria-hidden>
          <DeleteOutlineIcon sx={{ fontSize: 28 }} />
        </div>
        <h1 id="delete-account-title" className={styles.title}>
          Удаление аккаунта
        </h1>
        <p className={styles.lead}>
          Действие <strong>необратимо</strong>. Восстановление данных и входа будет невозможно; все сессии
          перестанут работать.
        </p>
        <p className={styles.bulletTitle}>Будут удалены или обезличены:</p>
        <ul className={styles.bulletList}>
          <li>профиль и настройки;</li>
          <li>данные учётной записи: логин, email и телефон (если указаны);</li>
          <li>прогресс тренировок и связанные данные в базе;</li>
          <li>push-подписки и напоминания;</li>
          <li>сессии и токены обновления.</li>
        </ul>
        <p className={styles.hint}>
          Мы отправим 6-значный код на ваш email. Без верного кода удаление невозможно.
        </p>
        <p className={styles.emailLine}>
          Код будет отправлен на: <strong>{emailTrimmed}</strong>
        </p>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={handleRequestCode}
          disabled={isRequesting}
        >
          {isRequesting ? "Отправка…" : "Отправить код на email"}
        </button>
        {requestOk ? <p className={styles.successBox}>{requestOk}</p> : null}
        {requestErr ? (
          <p className={styles.errorBox} role="alert">
            {requestErr}
          </p>
        ) : null}

        <form action={formAction}>
          <TextField
            id="delete-account-code"
            name="code"
            label="Код из письма"
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            fullWidth
            disabled={isPending}
            sx={textFieldSx}
            slotProps={{
              input: {
                inputProps: {
                  maxLength: 6,
                  pattern: "[0-9]*",
                  "aria-describedby": "delete-code-hint",
                },
              },
            }}
          />
          <p id="delete-code-hint" className={styles.hint} style={{ marginTop: "0.5rem" }}>
            Введите код и нажмите кнопку ниже, чтобы удалить аккаунт навсегда.
          </p>
          {state.success === false && state.error ? (
            <p className={styles.errorBox} role="alert">
              {state.error}
            </p>
          ) : null}
          <button type="submit" className={styles.dangerSubmit} disabled={isPending}>
            {isPending ? "Удаление…" : "Удалить навсегда"}
          </button>
        </form>
      </section>
    </main>
  );
}
