/** Owning API composition: auth Persistence. The Core facade has no
 * SQL imports; this binds the ORIGINAL transactional implementation. */
import { registerAuthRowsPort, type AuthRowsPort } from "@gafus/core/services/auth";
import * as sql from "@gafus/identity-write-server/auth-rows";

const rows: AuthRowsPort = {
  readAuthUsernameChangeActor: sql.readAuthUsernameChangeActor,
  readAuthUsernameCandidate: sql.readAuthUsernameCandidate,
  updateAuthUsername: sql.updateAuthUsername,
  readAuthCurrentUsername: sql.readAuthCurrentUsername,
  readAuthUsernameOwner: sql.readAuthUsernameOwner,
  readAuthUserSummary: sql.readAuthUserSummary,
  readLoginCredentials: sql.readLoginCredentials,
  readAuthRegistrationPending: sql.readAuthRegistrationPending,
  createAuthRefreshToken: sql.createAuthRefreshToken,
  readAuthRefreshToken: sql.readAuthRefreshToken,
  rotateAuthRefreshToken: sql.rotateAuthRefreshToken,
  revokeAuthRefreshToken: sql.revokeAuthRefreshToken,
  revokeAllAuthSessions: sql.revokeAllAuthSessions,
  readAuthVkPhone: sql.readAuthVkPhone,
  readAuthPhoneOwnerExcluding: sql.readAuthPhoneOwnerExcluding,
  updateAuthVkPhone: sql.updateAuthVkPhone,
  readAuthPasswordSetAt: sql.readAuthPasswordSetAt,
  setAuthPasswordOnce: sql.setAuthPasswordOnce,
  readAuthNotificationEmail: sql.readAuthNotificationEmail,
  readAuthPasswordForChange: sql.readAuthPasswordForChange,
  changeAuthPasswordCAS: sql.changeAuthPasswordCAS,
};
registerAuthRowsPort(rows);
