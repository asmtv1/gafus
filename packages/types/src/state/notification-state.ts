// State shape для уведомлений (БЕЗ методов)

export interface NotificationStateData {
  permission: NotificationPermission | null;
  subscription: PushSubscription | null;
  hasServerSubscription: boolean | null;
  showModal: boolean;
  isLoading: boolean;
  error: string | null;
  disabledByUser: boolean;
  userId: string;
}
