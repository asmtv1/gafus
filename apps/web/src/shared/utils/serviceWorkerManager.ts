// Универсальный менеджер Service Worker для всех браузеров
// Кардинальное решение проблем с PWA и Safari

import { createWebLogger } from "@gafus/logger";

// Создаем логгер для service worker
const logger = createWebLogger("web-service-worker");

interface ServiceWorkerManager {
  isSupported(): boolean;
  register(): Promise<ServiceWorkerRegistration>;
  getRegistration(): Promise<ServiceWorkerRegistration | null>;
  isReady(): Promise<boolean>;
}

class UniversalServiceWorkerManager implements ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private isRegistering = false;
  private registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

  isSupported(): boolean {
    return "serviceWorker" in navigator && "PushManager" in window;
  }

  async register(): Promise<ServiceWorkerRegistration> {
    if (!this.isSupported()) {
      throw new Error("Service Worker not supported");
    }

    // Если уже регистрируем - возвращаем тот же промис
    if (this.registrationPromise) {
      return this.registrationPromise;
    }

    // Если уже зарегистрирован - возвращаем существующий
    if (this.registration) {
      return this.registration;
    }

    logger.info("🚀 SW Manager: Starting service worker registration", {
      operation: "start_service_worker_registration",
      supported: this.isSupported(),
    });

    this.registrationPromise = this.performRegistration();

    try {
      this.registration = await this.registrationPromise;
      return this.registration;
    } catch (error) {
      this.registrationPromise = null;
      throw error;
    }
  }

  private async performRegistration(): Promise<ServiceWorkerRegistration> {
    logger.info("🔧 SW Manager: Registering service worker", {
      operation: "perform_service_worker_registration",
    });

    try {
      // Очищаем старые регистрации перед новой регистрацией
      await this.cleanupOldRegistrations();

      // Мгновенная регистрация без таймаутов
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        type: "classic",
        updateViaCache: "none",
      });

      logger.success("✅ SW Manager: SW registered successfully", {
        operation: "service_worker_registered",
        scope: registration.scope,
      });

      // Ждем активации Service Worker перед возвратом
      await this.waitForActivation(registration);

      return registration;
    } catch (error) {
      logger.error("❌ SW Manager: Registration failed", error as Error, {
        operation: "service_worker_registration_failed",
      });
      throw new Error("Service Worker registration failed");
    }
  }

  private async waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
    // Если уже активен - возвращаемся сразу
    if (registration.active && navigator.serviceWorker.controller) {
      logger.info("✅ SW Manager: Service Worker already active", {
        operation: "service_worker_already_active",
      });
      return;
    }

    logger.info("⏳ SW Manager: Waiting for Service Worker activation", {
      operation: "waiting_for_activation",
    });

    // Ждем активации с таймаутом 10 секунд
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Service Worker activation timeout"));
      }, 10000);

      const checkActive = () => {
        if (registration.active && navigator.serviceWorker.controller) {
          clearTimeout(timeout);
          logger.success("✅ SW Manager: Service Worker activated", {
            operation: "service_worker_activated",
          });
          resolve();
        }
      };

      // Проверяем immediately
      checkActive();

      // Если installing - ждем statechange
      if (registration.installing) {
        registration.installing.addEventListener("statechange", checkActive);
      }

      // Если waiting - ждем controllerchange
      if (registration.waiting) {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          clearTimeout(timeout);
          logger.success("✅ SW Manager: Service Worker controller changed", {
            operation: "service_worker_controller_changed",
          });
          resolve();
        });
      }
    });
  }

  private async cleanupOldRegistrations(): Promise<void> {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const currentScope = new URL("/", location.href).href;

      // Удаляем все регистрации, кроме текущей
      const cleanupPromises = registrations
        .filter((reg) => reg.scope !== currentScope)
        .map((reg) => reg.unregister());

      if (cleanupPromises.length > 0) {
        await Promise.all(cleanupPromises);
        logger.info(`🧹 SW Manager: Cleaned up ${cleanupPromises.length} old registrations`, {
          operation: "cleanup_old_registrations",
          cleanedCount: cleanupPromises.length,
        });
      }
    } catch (error) {
      logger.warn("⚠️ SW Manager: Failed to cleanup old registrations", {
        operation: "cleanup_old_registrations_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (this.registration) {
      return this.registration;
    }

    try {
      return await this.register();
    } catch {
      logger.error("SW Manager: Failed to get registration", new Error("Registration failed"), {
        operation: "get_registration_failed",
      });
      return null;
    }
  }

  async isReady(): Promise<boolean> {
    try {
      const registration = await this.getRegistration();
      return !!(registration?.active && navigator.serviceWorker.controller);
    } catch {
      return false;
    }
  }

  private detectSafari(): boolean {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isWebKit = /webkit/i.test(navigator.userAgent);
    const isChrome = /chrome/i.test(navigator.userAgent);
    return isWebKit && ((/safari/i.test(navigator.userAgent) && !isChrome) || isIOS);
  }
}

// Экспортируем синглтон
export const serviceWorkerManager = new UniversalServiceWorkerManager();
export default serviceWorkerManager;
