import type { AppSubscriptionSettingsPlanSource } from "@gafus/subscription-shared/plans";

/** Domain projection for a PromoCode row, independent of Prisma-generated
 * classes. The adapter alone owns SERIALIZABLE SQL transaction and P2002.
 */
export type PromoCodeRecord = {
  id: string;
  code: string;
  normalizedCode: string;
  discountPercent: number;
  isActive: boolean;
  revision: number;
  archivedAt: Date | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};
export type PromoCodeEventType = "CREATED" | "UPDATED" | "ENABLED" | "DISABLED" | "ARCHIVED";
export type PromoCodeEventRecord = {
  promoCodeId: string;
  actorId: string;
  type: PromoCodeEventType;
  discountPercent: number;
  isActive: boolean;
  revision: number;
  createdAt?: Date;
};
export type PromoCodeNewRecord = {
  code: string;
  normalizedCode: string;
  discountPercent: number;
  isActive: boolean;
  actorId: string;
};
export type PromoCodeRecordPatch = {
  actorId: string;
  discountPercent?: number;
  isActive?: boolean;
  archivedAt?: Date;
};
export interface PromoCodeRecordsTransaction {
  find(id: string): Promise<PromoCodeRecord | null>;
  create(record: PromoCodeNewRecord): Promise<PromoCodeRecord>;
  update(id: string, patch: PromoCodeRecordPatch): Promise<PromoCodeRecord>;
  appendEvent(record: PromoCodeEventRecord): Promise<void>;
  appendEvents(records: PromoCodeEventRecord[]): Promise<void>;
}
/** Read/SQL transaction port; no write runs outside one original
 * Prisma.TransactionIsolationLevel.Serializable callback. Core owns promo
 * validation, immutable pricing snapshot, event classification, public errors.
 */
export interface SubscriptionPromoPort {
  userHasSuccessfulPromoBlockingPayment(userId: string): Promise<boolean>;
  readPromoSettingsRow(): Promise<AppSubscriptionSettingsPlanSource>;
  readPromoCodeByNormalizedCode(code: string): Promise<PromoCodeRecord | null>;
  isUniquePromoCodeError(error: unknown): boolean;
  withPromoCodeRecordsTransaction<T>(operation: (rows: PromoCodeRecordsTransaction) => Promise<T>): Promise<T>;
}
let installedPromoPort: Readonly<SubscriptionPromoPort> | null = null;
export function registerSubscriptionPromoPort(port: SubscriptionPromoPort): void {
  if (installedPromoPort !== null && installedPromoPort !== port) {
    throw new Error("SUBSCRIPTION_PROMO_PORT_ALREADY_BOUND");
  }
  installedPromoPort = port;
}
export function requireSubscriptionPromoPort(): Readonly<SubscriptionPromoPort> {
  if (!installedPromoPort) throw new Error("SUBSCRIPTION_PROMO_PORT_UNBOUND");
  return installedPromoPort;
}
