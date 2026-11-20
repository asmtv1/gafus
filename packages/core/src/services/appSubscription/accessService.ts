/**
 * Core subscription access policy port. The authoritative query, role lookup,
 * payment history and current-period checks live in subscription-read-server.
 * A process composition root binds the port before any route is served.
 * A missing port must never mint entitlement: throw and fail closed.
 * This compatibility port is transitional; new use cases use constructor DI.
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

let installedAccessPort: Readonly<SubscriptionAccessPorts> | null = null;

export function registerSubscriptionAccessPort(port: SubscriptionAccessPorts): void {
  if (installedAccessPort !== null && installedAccessPort !== port) {
    throw new Error("SUBSCRIPTION_ACCESS_PORT_ALREADY_BOUND");
  }
  installedAccessPort = port;
}

function requireAccessPort(): Readonly<SubscriptionAccessPorts> {
  if (!installedAccessPort) throw new Error("SUBSCRIPTION_ACCESS_PORT_UNBOUND");
  return installedAccessPort;
}

export async function getAppSubscriptionAccess(
  userId: string, now: Date = new Date(), ports?: SubscriptionAccessPorts,
): Promise<AppSubscriptionStatusDto> {
  return (ports ?? requireAccessPort()).getAppSubscriptionAccess(userId, now);
}

export async function getCynologistEntitlements(
  userId: string, now: Date = new Date(), ports?: SubscriptionAccessPorts,
): Promise<CynologistEntitlements> {
  return (ports ?? requireAccessPort()).getCynologistEntitlements(userId, now);
}
