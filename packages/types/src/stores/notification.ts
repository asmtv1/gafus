// Типы для Notification Store

export interface NotificationState {
  permission: NotificationPermission | null;
  subscription: PushSubscription | null;
  hasServerSubscription: boolean | null;
  showModal: boolean;
  isLoading: boolean;
  error: string | null;
  disabledByUser: boolean;

  // Действия
  initializePermission: () => void;
  requestPermission: (vapidPublicKey?: string) => Promise<void>;
  dismissModal: () => void;
  setShowModal: (show: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  // Подписка на push-уведомления
  setupPushSubscription: (vapidPublicKey: string) => Promise<void>;
  checkServerSubscription: () => Promise<void>;
  removePushSubscription: () => Promise<void>;

  // Утилиты
  isSupported: () => boolean;
  canRequest: () => boolean;
  isGranted: () => boolean;

  // Автовосстановление серверной подписки при наличии разрешения
  ensureActiveSubscription: () => Promise<void>;

  // Управление пользовательским запретом авто-переподписки
  setDisabledByUser: (disabled: boolean) => void;
}
