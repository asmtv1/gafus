/**
 * Core subscription access policy port. The authoritative query, role lookup,
 * payment history and current-period checks live in subscription-read-server.
 * Each invocation receives the authoritative adapter explicitly.
 * A missing port must never mint entitlement: throw and fail closed.
 */
import type { AppSubscriptionStatusDto } from "@gafus/types";

export type CynologistEntitlements = {
  canUseCynologistChat: boolean;
  canBookConsultations: boolean;
};

export interface SubscriptionAccessPorts {
  getAppSubscriptionAccess(userId: string, now?: Date): Promise<AppSubscriptionStatusDto>;
  getCynologistEntitlements(userId: string, now?: Date): Promise<CynologistEntitlements>;
}

function requireAccessPort(port: SubscriptionAccessPorts): SubscriptionAccessPorts {
  if (!port) throw new Error("SUBSCRIPTION_ACCESS_PORT_UNBOUND");
  return port;
}

export async function getAppSubscriptionAccess(
  userId: string, now: Date = new Date(), ports: SubscriptionAccessPorts,
): Promise<AppSubscriptionStatusDto> {
  return (requireAccessPort(ports)).getAppSubscriptionAccess(userId, now);
}

export async function getCynologistEntitlements(
  userId: string, now: Date = new Date(), ports: SubscriptionAccessPorts,
): Promise<CynologistEntitlements> {
  return (requireAccessPort(ports)).getCynologistEntitlements(userId, now);
}
