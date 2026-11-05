/**
 * No old Mobile Chat2 clients after proxy-only cutover. This is an upgrade UX
 * guard, NOT a security identity check: current readGate/BAN remains mandatory
 * even when a caller spoofs version headers or looks like Web.
 */
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export type Chat2MobileVersionDecision =
  | { allowed: true }
  | { allowed: false; status: 426 | 503; code: string };

function parseVersion(raw: string | undefined) {
  if (!raw || !semver.test(raw)) return null;
  return raw.split('.').map(Number);
}

export function checkChat2MobileVersion(input: {
  platform?: string;
  version?: string;
  iosMinimum?: string;
  androidMinimum?: string;
}): Chat2MobileVersionDecision {
  const platform = input.platform?.trim().toLowerCase();
  if (platform !== 'ios' && platform !== 'android') return { allowed: true };
  const minimum = parseVersion(platform === 'ios' ? input.iosMinimum : input.androidMinimum);
  if (!minimum) return { allowed:false, status:503, code:'CHAT2_MOBILE_POLICY_UNAVAILABLE' };
  const current = parseVersion(input.version);
  if (!current) return { allowed:false, status:426, code:'CHAT2_MOBILE_UPDATE_REQUIRED' };
  for (let i=0;i<3;i++) {
    if (current[i] < minimum[i]) return { allowed:false, status:426, code:'CHAT2_MOBILE_UPDATE_REQUIRED' };
    if (current[i] > minimum[i]) return { allowed:true };
  }
  return { allowed:true };
}
