import type { PushSubscriptionJSON, PushSubscriptionKeys } from "../data/push";
/**
 * Валидирует VAPID публичный ключ
 * VAPID ключи должны быть в формате URL-safe base64
 */
export declare function validateVapidPublicKey(key: string): boolean;
/**
 * Валидирует VAPID приватный ключ
 */
export declare function validateVapidPrivateKey(key: string): boolean;
/**
 * Валидирует ключи push-подписки
 */
export declare function validatePushSubscriptionKeys(keys: unknown): keys is PushSubscriptionKeys;
/**
 * Валидирует push-подписку
 */
export declare function validatePushSubscription(subscription: unknown): subscription is PushSubscriptionJSON;
/**
 * Валидирует email для VAPID subject
 */
export declare function validateVapidSubject(subject: string): boolean;
//# sourceMappingURL=validation.d.ts.map