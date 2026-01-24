/**
 * Утилита для конфетти анимации
 * Используется для празднования достижений и завершений
 */

import confetti from "canvas-confetti";

/**
 * Базовое конфетти при завершении курса
 */
export function celebrateCourseCompletion(): void {
  if (typeof window === "undefined") return;

  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

  function randomInRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  const interval: ReturnType<typeof setInterval> = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      clearInterval(interval);
      return;
    }

    const particleCount = 50 * (timeLeft / duration);

    // Запускаем конфетти с двух сторон
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);
}

/**
 * Быстрое конфетти для маленьких достижений
 */
export function celebrateAchievement(): void {
  if (typeof window === "undefined") return;

  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    zIndex: 9999,
  });
}

/**
 * Конфетти при завершении дня тренировок
 */
export function celebrateDayCompletion(): void {
  if (typeof window === "undefined") return;

  confetti({
    particleCount: 50,
    angle: 60,
    spread: 55,
    origin: { x: 0 },
    zIndex: 9999,
  });
  confetti({
    particleCount: 50,
    angle: 120,
    spread: 55,
    origin: { x: 1 },
    zIndex: 9999,
  });
}

/**
 * Простое конфетти для UI feedback
 */
export function celebrateSimple(): void {
  if (typeof window === "undefined") return;

  confetti({
    particleCount: 30,
    spread: 60,
    origin: { y: 0.7 },
    zIndex: 9999,
  });
}

/**
 * Эпическое конфетти для больших достижений
 */
export function celebrateEpic(): void {
  if (typeof window === "undefined") return;

  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options): void {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });
  fire(0.2, {
    spread: 60,
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
}
