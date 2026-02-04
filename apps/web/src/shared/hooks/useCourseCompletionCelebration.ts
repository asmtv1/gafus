import { useEffect, useRef } from "react";
import { celebrateCourseCompletion } from "@shared/utils/confetti";
import { hapticAchievement } from "@shared/utils/hapticFeedback";
import Swal from "sweetalert2";

const STORAGE_KEY_PREFIX = "courseCompletionCelebrationSeen_";

interface UseCourseCompletionCelebrationProps {
  courseId: string;
  courseType: string;
  trainingDays?: {
    userStatus: string;
  }[];
}

/**
 * Хук для празднования завершения курса.
 * Показывает конфетти и уведомление один раз за курс (факт показа хранится в localStorage).
 */
export function useCourseCompletionCelebration({
  courseId,
  courseType,
  trainingDays,
}: UseCourseCompletionCelebrationProps): void {
  const celebratedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!courseId || !trainingDays || trainingDays.length === 0) return;

    const allCompleted = trainingDays.every((day) => day.userStatus === "COMPLETED");
    if (!allCompleted) return;

    const storageKey = `${STORAGE_KEY_PREFIX}${courseId}`;
    const alreadySeen =
      typeof window !== "undefined" && localStorage.getItem(storageKey) === "1";
    if (alreadySeen || celebratedRef.current) return;

    celebratedRef.current = true;
    localStorage.setItem(storageKey, "1");

    const timeoutId = setTimeout(() => {
      hapticAchievement();
      celebrateCourseCompletion();

      Swal.fire({
        title: "🎉 Курс завершен!",
        html: `
            <p style="font-size: 18px; margin-bottom: 12px;">
              Поздравляем с завершением курса!
            </p>
            <p style="font-size: 14px; color: #666;">
              Вы большой молодец! 🌟
            </p>
          `,
        imageUrl: "/uploads/logo.png",
        imageWidth: 120,
        imageHeight: 120,
        imageAlt: "Гафус",
        confirmButtonText: "Спасибо! 🎊",
        confirmButtonColor: "#636128",
        customClass: {
          popup: "swal2-popup-custom",
          title: "swal2-title-custom",
          htmlContainer: "swal2-content-custom",
          confirmButton: "swal2-confirm-custom",
        },
        showClass: {
          popup: "animate__animated animate__bounceIn",
        },
        hideClass: {
          popup: "animate__animated animate__fadeOut",
        },
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [trainingDays, courseId, courseType]);
}
