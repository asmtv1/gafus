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

    console.warn('🚀 SW Manager: Starting service worker registration...');

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
    console.warn('🔧 SW Manager: Registering service worker...');

    try {
      // Очищаем старые регистрации перед новой регистрацией
      await this.cleanupOldRegistrations();

      // Мгновенная регистрация без таймаутов
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        type: 'classic',
        updateViaCache: 'none'
      });

      console.warn('✅ SW Manager: SW registered successfully');
      return registration;

    } catch (error) {
      console.error('❌ SW Manager: Registration failed:', error);
      throw new Error('Service Worker registration failed');
    }
  }

  private async cleanupOldRegistrations(): Promise<void> {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const currentScope = new URL('/', location.href).href;
      
      // Удаляем все регистрации, кроме текущей
      const cleanupPromises = registrations
        .filter(reg => reg.scope !== currentScope)
        .map(reg => reg.unregister());
      
      if (cleanupPromises.length > 0) {
        await Promise.all(cleanupPromises);
        console.warn(`🧹 SW Manager: Cleaned up ${cleanupPromises.length} old registrations`);
      }
    } catch (error) {
      console.warn('⚠️ SW Manager: Failed to cleanup old registrations:', error);
    }
  }







  async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (this.registration) {
      return this.registration;
    }

    try {
      return await this.register();
    } catch {
      console.error('SW Manager: Failed to get registration');
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
    return isWebKit && (/safari/i.test(navigator.userAgent) && !isChrome || isIOS);
  }
}

// Экспортируем синглтон
export const serviceWorkerManager = new UniversalServiceWorkerManager();
export default serviceWorkerManager;
