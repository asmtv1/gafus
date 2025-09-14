export interface PushSubscriptionKeys {
    p256dh: string;
    auth: string;
}
export interface PushSubscriptionJSON {
    endpoint: string;
    keys: PushSubscriptionKeys;
}
export interface PushSubscription {
    endpoint: string;
    expirationTime?: number | null;
    keys: PushSubscriptionKeys;
}
export interface SendResult {
    endpoint: string;
    statusCode: number;
    body: string;
    headers: Record<string, string>;
}
//# sourceMappingURL=push.d.ts.map