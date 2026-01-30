"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Typography } from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCSRFStore } from "@gafus/csrf";
import { useOfflineStore } from "@shared/stores/offlineStore";
import { useCourseCompletionCelebration } from "@shared/hooks/useCourseCompletionCelebration";

import type { PaidCourseDrawerCourse } from "@/features/courses/components/PaidCourseDrawer";
import { showPersonalizationAlert } from "@shared/utils/sweetAlert";
import { getDeclinedName } from "@shared/lib/training/getDeclinedName";
import { saveCoursePersonalization } from "@shared/lib/training/saveCoursePersonalization";
import CourseDescriptionWithVideo from "../CourseDescriptionWithVideo";
import TrainingDayList from "../TrainingDayList";

import styles from "./TrainingPageClient.module.css";

interface TrainingPageClientProps {
  courseType: string;
  courseName?: string;
  initialData?: {
    trainingDays: {
      trainingDayId: string;
      dayOnCourseId: string;
      title: string;
      type: string;
      courseId: string;
      userStatus: string;
    }[];
    courseDescription: string | null;
    courseId: string | null;
    courseVideoUrl: string | null;
    courseEquipment: string | null;
    courseTrainingLevel: string | null;
    courseIsPersonalized?: boolean;
    userCoursePersonalization?: import("@gafus/types").UserCoursePersonalization | null;
  } | null;
  initialError?: string | null;
  accessDenied?: boolean;
  accessDeniedReason?: "private" | "paid" | null;
  courseForPay?: PaidCourseDrawerCourse | null;
  courseOutline?: { title: string; order: number }[];
  courseDescription?: string | null;
  userId?: string;
}

export default function TrainingPageClient({
  courseType,
  courseName,
  initialData,
  initialError,
  accessDenied = false,
  accessDeniedReason = null,
  courseForPay = null,
  courseOutline = [],
  courseDescription = null,
  userId,
}: TrainingPageClientProps) {
  const _online = useOfflineStore((s) => s.isOnline);
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const personalizationShownRef = useRef(false);

  const courseIsPersonalized = initialData?.courseIsPersonalized === true;
  const userCoursePersonalization = initialData?.userCoursePersonalization ?? null;
  const needPersonalization =
    (courseIsPersonalized && !userCoursePersonalization) ||
    searchParams.get("personalize") === "1";

  useEffect(() => {
    const courseId = initialData?.courseId;
    if (!needPersonalization || personalizationShownRef.current || !courseId) return;
    personalizationShownRef.current = true;
    void showPersonalizationAlert({
      initialValues: null,
      getDeclinedName,
    }).then((result) => {
      if (result === null) {
        router.push("/courses");
        return;
      }
      saveCoursePersonalization(courseId, result).then((res) => {
        if (res.success) router.refresh();
      });
    });
  }, [needPersonalization, initialData?.courseId, router]);

  useCourseCompletionCelebration({
    courseId: initialData?.courseId || "",
    courseType,
    trainingDays: initialData?.trainingDays,
  });

  const isAccessDenied =
    accessDenied || initialError === "COURSE_ACCESS_DENIED";

  const isPaidBlock = accessDeniedReason === "paid" && courseForPay;
  useEffect(() => {
    if (isPaidBlock && userId && !csrfToken && !csrfLoading) {
      void fetchToken();
    }
  }, [isPaidBlock, userId, csrfToken, csrfLoading, fetchToken]);

  const handlePay = useCallback(async () => {
    if (!courseForPay || !csrfToken || !userId) return;
    setPayError(null);
    setPayLoading(true);
    try {
      const res = await fetch("/api/v1/payments/create", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ courseId: courseForPay.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error ?? "Ошибка создания платежа");
        return;
      }
      if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl;
        return;
      }
      setPayError("Нет ссылки на оплату");
    } catch {
      setPayError("Ошибка сети");
    } finally {
      setPayLoading(false);
    }
  }, [courseForPay, csrfToken, userId]);

  if (needPersonalization) {
    return (
      <div className={styles.accessDeniedBlock}>
        <Typography color="text.secondary">Заполните данные для персонализированного курса…</Typography>
      </div>
    );
  }

  if (isAccessDenied) {
    if (accessDeniedReason === "paid" && courseForPay) {
      const isGuest = userId === undefined;
      const justPaid = searchParams.get("paid") === "1";
      return (
        <>
          {courseDescription && (
            <div className={styles.descriptionSection}>
              <h3 className={styles.outlineTitle}>Описание курса</h3>
              <p className={styles.descriptionText}>{courseDescription}</p>
            </div>
          )}
          {courseOutline.length > 0 && (
            <div className={styles.outlineSection}>
              <h3 className={styles.outlineTitle}>В курс входит</h3>
              <ol className={styles.outlineList}>
                {courseOutline.map((item, index) => (
                  <li key={`${item.order}-${index}`} className={styles.outlineItem}>
                    {item.title}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className={styles.accessDeniedBlock}>
            <h2 className={styles.title}>Курс платный</h2>
          <p className={styles.subtitle}>
            Оплатите «{courseForPay.name}» для доступа к занятиям.
            {courseForPay.priceRub > 0 && ` Стоимость: ${courseForPay.priceRub} ₽.`}
          </p>
          <p className={styles.deliveryHint}>
            После оплаты доступ к занятиям откроется автоматически в течение минуты.
          </p>
          {justPaid && !isGuest && (
            <p className={styles.paidHint}>
              Если вы только что оплатили, подождите несколько секунд и нажмите «Обновить».
            </p>
          )}
          {isGuest ? (
            <div className={styles.buttonsRow}>
              <Link
                href={`/login?returnUrl=${encodeURIComponent(`/trainings/${courseForPay.type}`)}`}
                className={styles.btnPrimary}
              >
                Войти
              </Link>
              <Link href="/courses" className={styles.btnOutline}>
                Назад к курсам
              </Link>
            </div>
          ) : (
            <>
              {payError && (
                <Typography color="error" sx={{ mt: 1, mb: 0 }}>
                  {payError}
                </Typography>
              )}
              <div className={styles.buttonsRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handlePay}
                  disabled={payLoading || csrfLoading}
                >
                  {payLoading || csrfLoading ? "Переход к оплате…" : "Оплатить"}
                </button>
                {justPaid && (
                  <button
                    type="button"
                    className={styles.btnOutline}
                    onClick={() => router.refresh()}
                  >
                    Обновить
                  </button>
                )}
                <Link href="/courses" className={styles.btnOutline}>
                  Назад к курсам
                </Link>
              </div>
            </>
          )}
          </div>
        </>
      );
    }
    if (accessDeniedReason === "private") {
      return (
        <div className={styles.accessDeniedBlock}>
          <h2 className={styles.title}>Курс недоступен 🔒</h2>
          <p className={styles.subtitle}>
            Этот курс приватный и доступен только по приглашению. Обратитесь к
            кинологу для получения доступа.
          </p>
          <div className={styles.buttonsRow}>
            <Link href="/courses" className={styles.btnPrimary}>
              Назад к курсам
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.accessDeniedBlock}>
        <h2 className={styles.title}>Доступ закрыт</h2>
        <p className={styles.subtitle}>У вас нет доступа к этому курсу.</p>
        <div className={styles.buttonsRow}>
          <Link href="/courses" className={styles.btnPrimary}>
            Назад к курсам
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="courseDescription">
        <CourseDescriptionWithVideo
          description={initialData?.courseDescription || null}
          videoUrl={initialData?.courseVideoUrl || null}
          equipment={initialData?.courseEquipment || null}
          trainingLevel={initialData?.courseTrainingLevel || null}
          courseName={courseName}
          courseType={courseType}
        />
      </div>

      <h3 className="plan">План занятий:</h3>
      <TrainingDayList
        courseType={courseType}
        initialData={initialData}
        initialError={initialError}
      />
    </>
  );
}
