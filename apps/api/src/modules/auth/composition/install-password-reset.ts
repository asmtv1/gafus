/** Legacy-only test adapter: production injects passwordResetPort explicitly. */
import { registerPasswordResetPort } from "@gafus/core/services/auth";
import { passwordResetPort } from "./password-reset-instance.js";
registerPasswordResetPort(passwordResetPort);
