"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Checkbox } from "@mui/material";

import { getCDNUrl } from "@gafus/cdn-upload";
import { reportClientError } from "@gafus/error-handling";

import { setListedCynologistsAction } from "../lib/set-listed-cynologists";

import styles from "./admin-consultations-list.module.css";

export interface AdminTrainerRow {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  about: string | null;
  isListed: boolean;
  cynologistId: string | null;
}

interface AdminConsultationsListProps {
  trainers: AdminTrainerRow[];
}

function resolveAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl?.trim()) {
    return null;
  }
  return avatarUrl.startsWith("http") ? avatarUrl : getCDNUrl(avatarUrl);
}

function plainAbout(raw: string | null): string {
  if (!raw?.trim()) {
    return "";
  }
  return raw.replace(/<[^>]*>/g, "").trim();
}

function initials(fullName: string | null, username: string): string {
  const s = (fullName ?? username).trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? "";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase() || "?";
}

/**
 * Карточки тренеров с чекбоксом «в каталоге консультаций»; сохранение через server action.
 */
export function AdminConsultationsList({ trainers }: AdminConsultationsListProps) {
  const router = useRouter();
  const initial = useMemo(
    () =>
      Object.fromEntries(trainers.map((t) => [t.userId, t.isListed])) as Record<string, boolean>,
    [trainers],
  );
  const [listed, setListed] = useState<Record<string, boolean>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleToggle = useCallback((userId: string, checked: boolean) => {
    setListed((prev) => ({ ...prev, [userId]: checked }));
  }, []);

  const handleSave = useCallback(() => {
    setError(null);
    const cynologistUserIds = Object.entries(listed)
      .filter(([, v]) => v)
      .map(([k]) => k);
    startTransition(() => {
      void (async () => {
        const res = await setListedCynologistsAction(cynologistUserIds);
        if (!res.success) {
          setError(res.error);
          return;
        }
        router.refresh();
      })().catch((e) => {
        reportClientError(e instanceof Error ? e : new Error(String(e)), {
          issueKey: "AdminConsultations",
          keys: { operation: "setListed" },
        });
        setError("Не удалось сохранить");
      });
    });
  }, [listed, router]);

  return (
    <Box>
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      <ul className={styles.list}>
        {trainers.map((t) => {
          const checked = listed[t.userId] ?? false;
          const src = resolveAvatarUrl(t.avatarUrl);
          const about = plainAbout(t.about);
          const title = t.fullName ?? t.username;

          return (
            <li key={t.userId} className={styles.card}>
              <div
                className={`${styles.cardInner} ${checked ? styles.cardInnerListed : ""}`}
              >
                <Box className={styles.checkbox}>
                  <Checkbox
                    checked={checked}
                    onChange={(_, c) => {
                      handleToggle(t.userId, c);
                    }}
                    inputProps={{ "aria-label": `Показывать в каталоге: ${title}` }}
                    color="success"
                  />
                </Box>
                <div className={styles.avatarWrap} aria-hidden>
                  {src ? (
                    <Image
                      src={src}
                      alt=""
                      width={64}
                      height={64}
                      className={styles.avatarImg}
                      unoptimized={src.startsWith("http")}
                    />
                  ) : (
                    <span className={styles.avatarFallback}>{initials(t.fullName, t.username)}</span>
                  )}
                </div>
                <div className={styles.body}>
                  <p className={styles.displayName}>{title}</p>
                  <p className={styles.username}>@{t.username}</p>
                  {about ? (
                    <p className={styles.about}>{about}</p>
                  ) : (
                    <p className={`${styles.about} ${styles.aboutEmpty}`}>
                      В профиле нет блока «О себе».
                    </p>
                  )}
                  {checked ? (
                    <span className={styles.badge}>В каталоге на сайте</span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className={styles.actions}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          className={styles.saveButton}
          disabled={pending}
          onClick={handleSave}
        >
          {pending ? "Сохранение…" : "Сохранить каталог"}
        </Button>
      </div>
    </Box>
  );
}
