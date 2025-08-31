// Универсальный менеджер Service Worker для всех браузеров
// Кардинальное решение проблем с PWA и Safari

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
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  async register(): Promise<ServiceWorkerRegistration> {
    if (!this.isSupported()) {
      throw new Error('Service Worker not supported');
    }

    // Если уже регистрируем - возвращаем тот же промис
    if (this.registrationPromise) {
      return this.registrationPromise;
    }

    // Если уже зарегистрирован - возвращаем существующий
    if (this.registration) {
      return this.registration;
    }

    console.log('🚀 SW Manager: Starting service worker registration...');

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
    const isSafari = this.detectSafari();
    const timeout = isSafari ? 15000 : 30000;

    console.log(`🔧 SW Manager: Registering for ${isSafari ? 'Safari' : 'Other'} browser (timeout: ${timeout}ms)`);

    try {
      // Стратегия 1: Использовать готовый Workbox SW (если есть)
      const existingRegistration = await this.tryGetExistingRegistration(timeout);
      if (existingRegistration) {
        console.log('✅ SW Manager: Using existing Workbox registration');
        return existingRegistration;
      }

      // Стратегия 2: Принудительно зарегистрировать SW
      const newRegistration = await this.tryForceRegistration(timeout);
      if (newRegistration) {
        console.log('✅ SW Manager: Force registration successful');
        return newRegistration;
      }

      // Стратегия 3: Создать минимальный SW на лету (крайний случай)
      return await this.createFallbackServiceWorker();

    } catch (error) {
      console.error('❌ SW Manager: All registration strategies failed:', error);
      throw new Error('Service Worker registration failed completely');
    }
  }

  private async tryGetExistingRegistration(timeout: number): Promise<ServiceWorkerRegistration | null> {
    try {
      return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Existing SW timeout')), timeout)
        )
      ]);
    } catch (error) {
      console.log('⚠️ SW Manager: No existing registration available');
      return null;
    }
  }

  private async tryForceRegistration(timeout: number): Promise<ServiceWorkerRegistration | null> {
    try {
      console.log('🔄 SW Manager: Force registering /sw.js...');
      
      const registration = await Promise.race([
        navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          type: 'classic'
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Force registration timeout')), timeout)
        )
      ]);

      // Ждем активации
      await this.waitForActivation(registration, timeout);
      return registration;

    } catch (error) {
      console.log('⚠️ SW Manager: Force registration failed:', error);
      return null;
    }
  }

  private async waitForActivation(registration: ServiceWorkerRegistration, timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('SW activation timeout'));
      }, timeout);

      const checkActivation = () => {
        if (registration.active && navigator.serviceWorker.controller) {
          clearTimeout(timeoutId);
          resolve();
          return;
        }

        // Если SW устанавливается
        if (registration.installing) {
          registration.installing.addEventListener('statechange', (e) => {
            const sw = e.target as ServiceWorker;
            if (sw.state === 'activated') {
              clearTimeout(timeoutId);
              resolve();
            } else if (sw.state === 'redundant') {
              clearTimeout(timeoutId);
              reject(new Error('SW became redundant'));
            }
          });
        }
        
        // Если SW ждет активации
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      };

      checkActivation();
      
      // Слушаем изменения контроллера
      navigator.serviceWorker.addEventListener('controllerchange', checkActivation);
    });
  }

  private async createFallbackServiceWorker(): Promise<ServiceWorkerRegistration> {
    console.log('🆘 SW Manager: Creating fallback service worker...');
    
    // Создаем минимальный SW с push поддержкой
    const swCode = `
      console.log('🆘 Fallback SW: Loaded');
      
      self.addEventListener('install', (event) => {
        console.log('🆘 Fallback SW: Install');
        self.skipWaiting();
      });
      
      self.addEventListener('activate', (event) => {
        console.log('🆘 Fallback SW: Activate');
        event.waitUntil(self.clients.claim());
      });
      
      self.addEventListener('push', (event) => {
        console.log('🆘 Fallback SW: Push received');
        const data = event.data ? event.data.json() : {};
        const title = data.title || 'Gafus';
        const options = {
          body: data.body || 'Новое уведомление',
          icon: '/icons/icon192.png',
          badge: '/icons/badge-72.png',
        };
        
        event.waitUntil(
          self.registration.showNotification(title, options)
        );
      });
      
      self.addEventListener('notificationclick', (event) => {
        event.notification.close();
        event.waitUntil(
          self.clients.matchAll().then((clients) => {
            if (clients.length > 0) {
              return clients[0].focus();
            }
            return self.clients.openWindow('/');
          })
        );
      });
    `;

    const blob = new Blob([swCode], { type: 'application/javascript' });
    const swUrl = URL.createObjectURL(blob);
    
    try {
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: '/',
        type: 'classic'
      });
      
      await this.waitForActivation(registration, 10000);
      console.log('✅ SW Manager: Fallback SW registered successfully');
      
      return registration;
    } finally {
      URL.revokeObjectURL(swUrl);
    }
  }

  async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (this.registration) {
      return this.registration;
    }

    try {
      return await this.register();
    } catch (error) {
      console.error('SW Manager: Failed to get registration:', error);
      return null;
    }
  }

  async isReady(): Promise<boolean> {
    try {
      const registration = await this.getRegistration();
      return !!(registration?.active && navigator.serviceWorker.controller);
    } catch (error) {
      return false;
    }
  }

  private detectSafari(): boolean {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isWebKit = /webkit/i.test(navigator.userAgent);
    const isChrome = /chrome/i.test(navigator.userAgent);
    return isWebKit && (/safari/i.test(navigator.userAgent) && !isChrome || isIOS);
  }
}

// Экспортируем синглтон
export const serviceWorkerManager = new UniversalServiceWorkerManager();
export default serviceWorkerManager;
