export interface NotificationState {
  permission: NotificationPermission | null;
  subscription: PushSubscription | null;
  hasServerSubscription: boolean | null;
  showModal: boolean;
  isLoading: boolean;
  error: string | null;
  initializePermission: () => void;
  requestPermission: () => Promise<void>;
  dismissModal: () => void;
  setShowModal: (show: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setupPushSubscription: () => Promise<void>;
  checkServerSubscription: () => Promise<void>;
  removePushSubscription: () => Promise<void>;
  isSupported: () => boolean;
  canRequest: () => boolean;
  isGranted: () => boolean;
}
//# sourceMappingURL=notification.d.ts.map
