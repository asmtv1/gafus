/**
 * Device Subscription Manager
 * Управляет подписками для каждого устройства отдельно
 * Следует лучшим практикам для multi-device push-уведомлений
 */

export interface DeviceSubscription {
  id: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  deviceType: 'safari' | 'chrome' | 'firefox' | 'other';
  userAgent: string;
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
  createdAt: Date;
  lastUsed: Date;
  isActive: boolean;
}

export interface DeviceInfo {
  id: string;
  type: 'safari' | 'chrome' | 'firefox' | 'other';
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
  userAgent: string;
  isPWA: boolean;
  isStandalone: boolean;
}

export class DeviceSubscriptionManager {
  private static instance: DeviceSubscriptionManager;
  private deviceSubscriptions: Map<string, DeviceSubscription> = new Map<string, DeviceSubscription>();
  private currentDeviceId: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): DeviceSubscriptionManager {
    if (!DeviceSubscriptionManager.instance) {
      DeviceSubscriptionManager.instance = new DeviceSubscriptionManager();
    }
    return DeviceSubscriptionManager.instance;
  }

  /**
   * Генерирует уникальный ID устройства
   */
  private generateDeviceId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    const userAgentHash = this.hashString(navigator.userAgent).substring(0, 8);
    return `device_${timestamp}_${random}_${userAgentHash}`;
  }

  /**
   * Простой хеш строки
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Определяет тип устройства по User-Agent
   */
  private detectDeviceType(): 'safari' | 'chrome' | 'firefox' | 'other' {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      return 'safari';
    } else if (userAgent.includes('chrome')) {
      return 'chrome';
    } else if (userAgent.includes('firefox')) {
      return 'firefox';
    } else {
      return 'other';
    }
  }

  /**
   * Определяет платформу
   */
  private detectPlatform(): 'ios' | 'android' | 'desktop' | 'unknown' {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/ipad|iphone|ipod/.test(userAgent)) {
      return 'ios';
    } else if (/android/.test(userAgent)) {
      return 'android';
    } else if (/windows|macintosh|linux/.test(userAgent)) {
      return 'desktop';
    } else {
      return 'unknown';
    }
  }

  /**
   * Проверяет PWA режим
   */
  private isPWAStandalone(): boolean {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  /**
   * Получает информацию о текущем устройстве
   */
  getCurrentDeviceInfo(): DeviceInfo {
    const deviceId = this.currentDeviceId || this.generateDeviceId();
    if (!this.currentDeviceId) {
      this.currentDeviceId = deviceId;
    }

    return {
      id: deviceId,
      type: this.detectDeviceType(),
      platform: this.detectPlatform(),
      userAgent: navigator.userAgent,
      isPWA: this.isPWAStandalone(),
      isStandalone: this.isPWAStandalone(),
    };
  }

  /**
   * Создает подписку для текущего устройства
   */
  async createDeviceSubscription(
    vapidPublicKey: string,
    userId: string
  ): Promise<DeviceSubscription> {
    const deviceInfo = this.getCurrentDeviceInfo();
    
    // Специальная проверка для Safari
    if (deviceInfo.type === 'safari' && !deviceInfo.isPWA) {
      throw new Error(
        "Для push-уведомлений в Safari добавьте сайт в главный экран и запустите как приложение"
      );
    }

    // Проверяем существующую подписку
    const existingSubscription = await this.getExistingSubscription();
    if (existingSubscription) {
      await existingSubscription.unsubscribe();
    }

    // Создаем новую подписку
    const registration = await navigator.serviceWorker.ready;
    const applicationServerKey = this.urlBase64ToUint8Array(vapidPublicKey);
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    const p256dh = subscription.getKey ? subscription.getKey("p256dh") : null;
    const auth = subscription.getKey ? subscription.getKey("auth") : null;

    if (!subscription.endpoint || !p256dh || !auth) {
      throw new Error("Invalid subscription data");
    }

    // Проверяем endpoint для Safari
    if (deviceInfo.type === 'safari') {
      const isAPNSEndpoint = subscription.endpoint.includes('web.push.apple.com');
      if (!isAPNSEndpoint) {
        console.warn("⚠️ Safari создал FCM endpoint вместо APNS. Возможно, нужна перезагрузка в PWA режиме.");
      } else {
        console.log("✅ Safari создал правильный APNS endpoint");
      }
    }

    // Создаем объект подписки устройства
    const deviceSubscription: DeviceSubscription = {
      id: deviceInfo.id,
      userId,
      endpoint: subscription.endpoint,
      keys: {
        p256dh: this.arrayBufferToBase64(p256dh),
        auth: this.arrayBufferToBase64(auth),
      },
      deviceType: deviceInfo.type,
      userAgent: deviceInfo.userAgent,
      platform: deviceInfo.platform,
      createdAt: new Date(),
      lastUsed: new Date(),
      isActive: true,
    };

    // Сохраняем в локальное хранилище
    this.deviceSubscriptions.set(deviceInfo.id, deviceSubscription);
    this.saveToLocalStorage();

    console.log("✅ Device subscription created successfully");
    console.log(`🔗 Endpoint: ${subscription.endpoint.substring(0, 50)}...`);
    console.log(`📱 Device Type: ${deviceInfo.type}`);
    console.log(`🆔 Device ID: ${deviceInfo.id}`);
    console.log(`🌍 Platform: ${deviceInfo.platform}`);

    return deviceSubscription;
  }

  /**
   * Получает существующую подписку
   */
  private async getExistingSubscription(): Promise<PushSubscription | null> {
    try {
      const registration = await navigator.serviceWorker.ready;
      return await registration.pushManager.getSubscription();
    } catch (error) {
      console.warn("Failed to get existing subscription:", error);
      return null;
    }
  }

  /**
   * Удаляет подписку устройства
   */
  async removeDeviceSubscription(deviceId: string): Promise<void> {
    try {
      // Удаляем локально
      this.deviceSubscriptions.delete(deviceId);
      this.saveToLocalStorage();

      // Удаляем из браузера
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      console.log(`✅ Device subscription ${deviceId} removed successfully`);
    } catch (error) {
      console.error(`❌ Failed to remove device subscription ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Обновляет время последнего использования
   */
  refreshDeviceSubscription(deviceId: string): void {
    const subscription = this.deviceSubscriptions.get(deviceId);
    if (subscription) {
      subscription.lastUsed = new Date();
      this.saveToLocalStorage();
      console.log(`✅ Device subscription ${deviceId} refreshed`);
    }
  }

  /**
   * Получает подписку по ID устройства
   */
  getDeviceSubscription(deviceId: string): DeviceSubscription | undefined {
    return this.deviceSubscriptions.get(deviceId);
  }

  /**
   * Получает все активные подписки
   */
  getAllActiveSubscriptions(): DeviceSubscription[] {
    return Array.from(this.deviceSubscriptions.values()).filter(sub => sub.isActive);
  }

  /**
   * Получает подписки по типу устройства
   */
  getSubscriptionsByType(deviceType: DeviceSubscription['deviceType']): DeviceSubscription[] {
    return this.getAllActiveSubscriptions().filter(sub => sub.deviceType === deviceType);
  }

  /**
   * Получает подписки по платформе
   */
  getSubscriptionsByPlatform(platform: DeviceSubscription['platform']): DeviceSubscription[] {
    return this.getAllActiveSubscriptions().filter(sub => sub.platform === platform);
  }

  /**
   * Получает текущую подписку устройства
   */
  getCurrentDeviceSubscription(): DeviceSubscription | undefined {
    if (!this.currentDeviceId) return undefined;
    return this.deviceSubscriptions.get(this.currentDeviceId);
  }

  /**
   * Проверяет поддержку push-уведомлений
   */
  isPushSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  /**
   * Проверяет поддержку уведомлений
   */
  isNotificationSupported(): boolean {
    return typeof Notification !== 'undefined';
  }

  /**
   * Конвертирует Base64URL в Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Конвертирует ArrayBuffer в Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Сохраняет в localStorage
   */
  private saveToLocalStorage(): void {
    try {
      const data = {
        deviceSubscriptions: Array.from(this.deviceSubscriptions.entries()),
        currentDeviceId: this.currentDeviceId,
        timestamp: Date.now(),
      };
      localStorage.setItem('device-subscriptions', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }

  /**
   * Загружает из localStorage
   */
  loadFromLocalStorage(): void {
    try {
      const data = localStorage.getItem('device-subscriptions');
      if (data) {
        const parsed = JSON.parse(data);
        this.deviceSubscriptions = new Map(parsed.deviceSubscriptions || []);
        this.currentDeviceId = parsed.currentDeviceId || null;
        
        // Восстанавливаем Date объекты
        for (const subscription of this.deviceSubscriptions.values()) {
          subscription.createdAt = new Date(subscription.createdAt);
          subscription.lastUsed = new Date(subscription.lastUsed);
        }
        
        console.log(`✅ Loaded ${this.deviceSubscriptions.size} device subscriptions from localStorage`);
      }
    } catch (error) {
      console.warn('Failed to load from localStorage:', error);
    }
  }

  /**
   * Очищает все данные
   */
  clear(): void {
    this.deviceSubscriptions.clear();
    this.currentDeviceId = null;
    localStorage.removeItem('device-subscriptions');
    console.log('✅ Device subscription manager cleared');
  }
}

// Экспортируем singleton instance
export const deviceManager = DeviceSubscriptionManager.getInstance();
