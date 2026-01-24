/**
 * Утилита для определения поддержки Web Push уведомлений на разных платформах
 * Возвращает информацию о платформе и какие диалоги нужно показать
 */

export interface PushSupportInfo {
  isSupported: boolean;
  requiresPWA: boolean;
  isInPWA: boolean;
  platform: "ios" | "android" | "desktop";
  isMobile: boolean;
  showInstallPrompt: boolean; // true для iOS не-PWA
  showNotificationPrompt: boolean; // true для iOS PWA, Android, Desktop
  reason?: string;
}

/**
 * Определяет режим PWA (standalone)
 */
function isStandaloneMode(): boolean {
  // Для iOS Safari
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }

  // Для остальных браузеров (Android, Desktop)
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }

  return false;
}

/**
 * Определяет платформу устройства
 */
function detectPlatform(): "ios" | "android" | "desktop" {
  const userAgent = navigator.userAgent.toLowerCase();

  if (/ipad|iphone|ipod/.test(userAgent)) {
    return "ios";
  }

  if (/android/.test(userAgent)) {
    return "android";
  }

  return "desktop";
}

/**
 * Определяет браузер
 */
function detectBrowser(): "safari" | "chrome" | "firefox" | "other" {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes("safari") && !userAgent.includes("chrome")) {
    return "safari";
  }

  if (userAgent.includes("chrome")) {
    return "chrome";
  }

  if (userAgent.includes("firefox")) {
    return "firefox";
  }

  return "other";
}

/**
 * Проверяет поддержку Web Push API
 */
function hasPushSupport(): boolean {
  return (
    "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined"
  );
}

/**
 * Основная функция определения поддержки Web Push
 *
 * @returns PushSupportInfo с информацией о платформе и действиях
 */
export function detectPushSupport(): PushSupportInfo {
  const platform = detectPlatform();
  const isMobile = platform === "ios" || platform === "android";
  const isInPWA = isStandaloneMode();
  const browser = detectBrowser();
  const hasSupport = hasPushSupport();

  // Desktop - показываем запрос на уведомления, но не просим установить PWA
  if (platform === "desktop") {
    return {
      isSupported: hasSupport,
      requiresPWA: false,
      isInPWA: false,
      platform: "desktop",
      isMobile: false,
      showInstallPrompt: false,
      showNotificationPrompt: hasSupport, // Показываем запрос на уведомления
    };
  }

  // iOS Safari
  if (platform === "ios" && browser === "safari") {
    // iOS в браузере - не поддерживается, нужна PWA
    if (!isInPWA) {
      return {
        isSupported: false,
        requiresPWA: true,
        isInPWA: false,
        platform: "ios",
        isMobile: true,
        showInstallPrompt: true,
        showNotificationPrompt: false,
        reason: "iOS Safari поддерживает Web Push только в PWA режиме",
      };
    }

    // iOS в PWA - поддерживается
    return {
      isSupported: hasSupport,
      requiresPWA: true,
      isInPWA: true,
      platform: "ios",
      isMobile: true,
      showInstallPrompt: false,
      showNotificationPrompt: hasSupport,
    };
  }

  // Android - поддерживается в браузере и PWA
  if (platform === "android") {
    return {
      isSupported: hasSupport,
      requiresPWA: false,
      isInPWA,
      platform: "android",
      isMobile: true,
      showInstallPrompt: false,
      showNotificationPrompt: hasSupport,
    };
  }

  // Остальные случаи (iOS в другом браузере и т.д.)
  return {
    isSupported: hasSupport,
    requiresPWA: false,
    isInPWA,
    platform,
    isMobile,
    showInstallPrompt: false,
    showNotificationPrompt: hasSupport && isMobile,
  };
}
