export interface NotificationState {
    permission: NotificationPermission | null;
    subscription: PushSubscription | null;
    hasServerSubscription: boolean | null;
    showModal: boolean;
    isLoading: boolean;
    error: string | null;
    disabledByUser: boolean;
    userId: string;
    initializePermission: () => void;
    requestPermission: (vapidPublicKey?: string) => Promise<void>;
    dismissModal: () => void;
    setShowModal: (show: boolean) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    clearError: () => void;
    setupPushSubscription: (vapidPublicKey: string) => Promise<void>;
    checkServerSubscription: () => Promise<void>;
    removePushSubscription: () => Promise<void>;
    isSupported: () => boolean;
    canRequest: () => boolean;
    isGranted: () => boolean;
    ensureActiveSubscription: () => Promise<void>;
    setDisabledByUser: (disabled: boolean) => void;
    setUserId: (userId: string) => void;
    updateSubscriptionAction: (subscription: {
        id: string;
        userId: string;
        endpoint: string;
        p256dh: string;
        auth: string;
        keys: {
            p256dh: string;
            auth: string;
        };
    }) => Promise<{
        success: boolean;
    }>;
}
//# sourceMappingURL=notification.d.ts.map