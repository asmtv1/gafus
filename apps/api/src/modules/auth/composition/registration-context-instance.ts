/** API-owned SQL composition; no process-global Core registration required. */
import type { RegistrationContextPorts } from "@gafus/core/services/auth";
import {
  withRegistrationTransaction,
  readIsRegistrationCompleted,
} from "@gafus/identity-write-server/registration-context-reads";

export const registrationContextPort = {
  withRegistrationTransaction,
  readIsRegistrationCompleted,
} satisfies RegistrationContextPorts;
