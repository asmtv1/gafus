import { useEffect, useRef } from "react";
import { celebrateCourseCompletion } from "@/utils/confetti";
import { hapticAchievement } from "@/utils/hapticFeedback";
import Swal from "sweetalert2";

interface UseCourseCompletionCelebrationProps {
  courseId: string;
  courseType: string;
  trainingDays?: {
    userStatus: string;
  }[];
}

/**
 * Хук для празднования завершения курса
 * Показывает конфетти и уведомление когда все дни завершены
 */
export function useCourseCompletionCelebration({
  courseId,
  courseType,
  trainingDays,
}: UseCourseCompletionCelebrationProps): void {
  // Используем ref для отслеживания предыдущего состояния
  const prevCompletedRef = useRef<boolean>(false);
  const celebratedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!trainingDays || trainingDays.length === 0) return;

    // Проверяем, все ли дни завершены
    const allCompleted = trainingDays.every(
      (day) => day.userStatus === "COMPLETED",
    );

    // Если курс только что завершен (не был завершен раньше и еще не праздновали)
    if (allCompleted && !prevCompletedRef.current && !celebratedRef.current) {
      // Отмечаем что уже праздновали (для предотвращения повторных вызовов)
      celebratedRef.current = true;
      prevCompletedRef.current = true;

      // Небольшая задержка для лучшего UX
      setTimeout(() => {
        // Haptic feedback
        hapticAchievement();

        // Конфетти
        celebrateCourseCompletion();

        // Показываем красивое уведомление
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
          imageUrl: "/logo.png",
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
    }

    // Обновляем предыдущее состояние
    prevCompletedRef.current = allCompleted;
  }, [trainingDays, courseId, courseType]);
}



