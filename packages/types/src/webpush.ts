export interface PushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface SendResult {
  endpoint: string;
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}
