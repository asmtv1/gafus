import { resolveRegistrationPromoCodeInTransaction } from "./registrationContracts";
import type { RegistrationContractRowsPort } from "./registrationContractRowsPort";

/** Existing accounts and new password registrations share the same completion gate. */
type RegistrationTx = Parameters<typeof resolveRegistrationPromoCodeInTransaction>[0];
export interface RegistrationContextPorts {
  withRegistrationTransaction<T>(action: (tx: RegistrationTx) => Promise<T>): Promise<T>;
  readIsRegistrationCompleted(userId: string): Promise<boolean>;
}
function requireRegistrationContextPort(port: RegistrationContextPorts | undefined): Readonly<RegistrationContextPorts> {
  if (!port) throw new Error("REGISTRATION_CONTEXT_PORT_UNBOUND");
  return port;
}

/** Centralized registration-channel values; adapters no longer import Prisma enums. */
export async function previewRegistrationPromoCode(
  rawCode: unknown, ports?: RegistrationContextPorts, rows?: RegistrationContractRowsPort,
) {
  return (requireRegistrationContextPort(ports)).withRegistrationTransaction(
    tx => resolveRegistrationPromoCodeInTransaction(tx, rawCode, rows),
  );
}

/** Every protected API request validates completion against current DB state. */
export async function isRegistrationCompleted(userId: string, ports?: RegistrationContextPorts): Promise<boolean> {
  return (requireRegistrationContextPort(ports)).readIsRegistrationCompleted(userId);
}
