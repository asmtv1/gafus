"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Typography } from "@mui/material";
import { trackEvent } from "@gafus/analytics";
import { useRouter, useSearchParams } from "next/navigation";
import { reportClientError } from "@gafus/error-handling";
import { useCourseCompletionCelebration } from "@shared/hooks/useCourseCompletionCelebration";

import type { PaidCourseDrawerCourse } from "@/features/courses";
import type { UserCoursePersonalization } from "@gafus/types";
import { showPersonalizationAlert } from "@shared/utils/sweetAlert";
import { getDeclinedName } from "@shared/lib/training/getDeclinedName";
import { saveCoursePersonalization } from "@shared/lib/training/saveCoursePersonalization";
import CourseDescriptionWithVideo from "../CourseDescriptionWithVideo";
import TrainingDayList from "../TrainingDayList";
import { AppBackButtonLink, PrimaryButtonLink } from "@/shared/components/ui";
import { AppSubscriptionPaywall } from "@/features/app-subscription";

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
    userCoursePersonalization?: UserCoursePersonalization | null;
  } | null;
  initialError?: string | null;
  accessDenied?: boolean;
  accessDeniedReason?: "private" | "paid" | null;
  courseForPay?: PaidCourseDrawerCourse | null;
  courseOutline?: { id: string; title: string; order: number }[];
  courseDescription?: string | null;
  courseVideoUrl?: string | null;
  courseEquipment?: string | null;
  courseTrainingLevel?: string | null;
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
  courseVideoUrl = null,
  courseEquipment = null,
  courseTrainingLevel = null,
  userId,
}: TrainingPageClientProps) {
  const [personalizationError, setPersonalizationError] = useState<string | null>(null);
  const [personalizationSaving, setPersonalizationSaving] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const personalizationShownRef = useRef(false);

  useEffect(() => {
    trackEvent({
      eventName: "course_open",
      platform: "web",
      pathOrScreen: `/trainings/${courseType}`,
      courseType,
      courseId: initialData?.courseId ?? undefined,
    });
  }, [courseType, initialData?.courseId]);

  const courseIsPersonalized = initialData?.courseIsPersonalized === true;
  const userCoursePersonalization = initialData?.userCoursePersonalization ?? null;
  const needPersonalization =
    (courseIsPersonalized && !userCoursePersonalization) ||
    searchParams.get("personalize") === "1";

  useEffect(() => {
    const courseId = initialData?.courseId;
    if (!needPersonalization || personalizationShownRef.current || !courseId) return;
    personalizationShownRef.current = true;
    setPersonalizationError(null);
    void (async () => {
      try {
        const result = await showPersonalizationAlert({
          initialValues: null,
          getDeclinedName,
        });
        if (result === null) {
          router.push("/courses");
          return;
        }
        setPersonalizationSaving(true);
        const res = await saveCoursePersonalization(courseId, result);
        setPersonalizationSaving(false);
        if (res.success) {
          router.refresh();
        } else {
          setPersonalizationError(res.error ?? "Не удалось сохранить");
          personalizationShownRef.current = false;
        }
      } catch (err) {
        reportClientError(err, {
          issueKey: "TrainingPageClient",
          keys: { operation: "need_personalization_flow" },
        });
        setPersonalizationSaving(false);
        personalizationShownRef.current = false;
        setPersonalizationError("Произошла ошибка");
      }
    })();
  }, [needPersonalization, initialData?.courseId, router]);

  useCourseCompletionCelebration({
    courseId: initialData?.courseId || "",
    courseType,
    trainingDays: initialData?.trainingDays,
  });

  const handleChangePersonalization = useCallback(async () => {
    if (!initialData?.courseId) return;
    setPersonalizationError(null);
    try {
      const result = await showPersonalizationAlert({
        initialValues: userCoursePersonalization ?? undefined,
        getDeclinedName,
      });
      if (result === null) return;
      setPersonalizationSaving(true);
      const res = await saveCoursePersonalization(initialData.courseId, result);
      if (res.success) {
        router.refresh();
      } else {
        setPersonalizationError(res.error ?? "Не удалось сохранить");
      }
    } catch (err) {
      reportClientError(err, {
        issueKey: "TrainingPageClient",
        keys: { operation: "save_personalization" },
      });
      setPersonalizationError("Произошла ошибка");
    } finally {
      setPersonalizationSaving(false);
    }
  }, [userCoursePersonalization, initialData?.courseId, router]);

  const isAccessDenied = accessDenied || initialError === "COURSE_ACCESS_DENIED";

  if (needPersonalization) {
    return (
      <div className={styles.accessDeniedBlock}>
        {personalizationSaving ? (
          <Typography color="text.secondary">Сохранение…</Typography>
        ) : personalizationError ? (
          <>
            <Typography color="error">{personalizationError}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Обновите страницу и заполните форму снова.
            </Typography>
          </>
        ) : (
          <Typography color="text.secondary">Заполните данные для персонализированного курса…</Typography>
        )}
      </div>
    );
  }

  if (isAccessDenied) {
    if (accessDeniedReason === "paid" && courseForPay) {
      const isGuest = userId === undefined;
      return (
        <>
          <div className="courseDescription">
            <CourseDescriptionWithVideo
              description={courseDescription ?? null}
              videoUrl={courseVideoUrl ?? null}
              equipment={courseEquipment ?? null}
              trainingLevel={courseTrainingLevel ?? null}
              courseName={courseForPay?.name}
              courseType={courseType}
            />
          </div>
          {courseOutline.length > 0 && (
            <div className={styles.outlineSection}>
              <h3 className={styles.outlineTitle}>В курс входит</h3>
              <ol className={styles.outlineList}>
                {courseOutline.map((item) => (
                  <li key={item.id} className={styles.outlineItem}>
                    <a href={`/trainings/${encodeURIComponent(courseType)}/${encodeURIComponent(item.id)}`}>
                      {item.title} — открыть шаги
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className={styles.accessDeniedBlock}>
            <h2 className={styles.title}>Доступно по подписке</h2>
            <p className={styles.subtitle}>
              Подписка открывает все обычные курсы и статьи, включая «{courseForPay.name}».
            </p>
            {isGuest ? (
              <PrimaryButtonLink
                href={`/login?returnUrl=${encodeURIComponent(`/trainings/${courseForPay.type}`)}`}
                className={styles.btnPrimary}
              >Войти и оформить подписку</PrimaryButtonLink>
            ) : (
              <AppSubscriptionPaywall mode="embedded" />
            )}
            <AppBackButtonLink href="/courses">Назад к курсам</AppBackButtonLink>
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
            <AppBackButtonLink href="/courses">
              Назад к курсам
            </AppBackButtonLink>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.accessDeniedBlock}>
        <h2 className={styles.title}>Доступ закрыт</h2>
        <p className={styles.subtitle}>У вас нет доступа к этому курсу.</p>
        <div className={styles.buttonsRow}>
            <AppBackButtonLink href="/courses">
            Назад к курсам
            </AppBackButtonLink>
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

      {courseIsPersonalized && userCoursePersonalization && initialData?.courseId && (
        <div style={{ marginBottom: "16px" }}>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={handleChangePersonalization}
            disabled={personalizationSaving}
          >
            {personalizationSaving ? "Сохранение…" : "Изменить данные персонализации"}
          </button>
          {personalizationError && (
            <Typography color="error" sx={{ mt: 1 }}>
              {personalizationError}
            </Typography>
          )}
        </div>
      )}

      <section className={styles.planSection} aria-labelledby="course-plan-heading">
        <h3 id="course-plan-heading" className={styles.planHeading}>План занятий</h3>
        <TrainingDayList
          courseType={courseType}
          initialData={initialData}
          initialError={initialError}
        />
      </section>
    </>
  );
}
