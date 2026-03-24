// Универсальный менеджер Service Worker для всех браузеров
// Кардинальное решение проблем с PWA и Safari

import { reportClientError } from "@gafus/error-handling";
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
      logger.warn("⚠️ SW Manager: Registration failed (push/offline may be unavailable)", {
        operation: "service_worker_registration_failed",
        error: error instanceof Error ? error.message : String(error),
      });
      reportClientError(error, {
        severity: "warning",
        issueKey: "ServiceWorkerManager",
        keys: { operation: "perform_registration" },
      });
      throw new Error("Service Worker registration failed");
    }
  }

  private async waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
    // Успех: SW активен (controller может быть null до перезагрузки страницы)
    const isActive = () => !!registration.active;

    if (isActive()) {
      logger.info("✅ SW Manager: Service Worker already active", {
        operation: "service_worker_already_active",
      });
      return;
    }

    logger.info("⏳ SW Manager: Waiting for Service Worker activation", {
      operation: "waiting_for_activation",
    });

    const ACTIVATION_MS = 15000;
    const FALLBACK_MS = 5000;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (registration.waiting || registration.installing) {
          // SW зарегистрирован, но ещё не активен (ожидает skipWaiting или перезагрузки) — не считаем ошибкой
          logger.warn("⚠️ SW Manager: Activation pending (will control page after reload)", {
            operation: "service_worker_activation_pending",
          });
          resolve();
        } else {
          reject(new Error("Service Worker activation timeout"));
        }
      }, ACTIVATION_MS);

      const fallback = setTimeout(() => {
        if (registration.waiting) {
          clearTimeout(timeout);
          logger.info("SW Manager: Registration ready, activation after reload", {
            operation: "service_worker_waiting_ok",
          });
          resolve();
        }
      }, FALLBACK_MS);

      const checkActive = () => {
        if (isActive()) {
          clearTimeout(timeout);
          clearTimeout(fallback);
          logger.success("✅ SW Manager: Service Worker activated", {
            operation: "service_worker_activated",
          });
          resolve();
        }
      };

      checkActive();

      if (registration.installing) {
        registration.installing.addEventListener("statechange", checkActive);
      }

      if (registration.waiting) {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            clearTimeout(timeout);
            clearTimeout(fallback);
            logger.success("✅ SW Manager: Service Worker controller changed", {
              operation: "service_worker_controller_changed",
            });
            resolve();
          },
          { once: true },
        );
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
      reportClientError(error, {
        severity: "warning",
        issueKey: "ServiceWorkerManager",
        keys: { operation: "cleanup_old_registrations" },
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
      logger.warn("SW Manager: No registration (push unavailable)", {
        operation: "get_registration_failed",
      });
      return null;
    }
  }

  async isReady(): Promise<boolean> {
    try {
      const registration = await this.getRegistration();
      return !!(registration?.active && navigator.serviceWorker.controller);
    } catch (error) {
      reportClientError(error, {
        severity: "warning",
        issueKey: "ServiceWorkerManager",
        keys: { operation: "is_ready" },
      });
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
