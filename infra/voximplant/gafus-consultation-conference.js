/**
 * GAFUS secure two-party Voximplant conference.
 * Routing rule: ^gafus_[a-f0-9]{30}$, Video conference enabled.
 * In Voximplant application Secrets store GAFUS_VOX_ADMISSION_SECRET,
 * equal to the backend's VOXIMPLANT_ADMISSION_SECRET (>= 32 bytes).
 * Never embed secrets in this scenario.
 */
require(Modules.Conference);
require(Modules.Crypto);

let conference = null;
let participants = 0;
let idleStop = null;
let admissionSecret = null;

function isAllowed(event) {
  if (!admissionSecret || admissionSecret.length < 32) return false;
  const room = String(event.destination || "");
  if (!/^gafus_[a-f0-9]{30}$/.test(room)) return false;
  // Provider-issued caller address, NOT an untrusted custom header.
  const from = String(event.fromURI || "");
  const match = from.match(/\bg_u_[a-f0-9]{30}(?=@)/);
  if (!match) return false;
  const username = match[0];
  const ticket = String(event.customData || "");
  const tokens = ticket.match(/^([0-9]{10,11})\.([a-f0-9]{64})$/);
  if (!tokens) return false;
  const expiry = Number(tokens[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiry) || expiry < now || expiry > now + 120) return false;
  const signed = "v1:" + room + ":" + username + ":" + expiry;
  const expected = Crypto.hmac_sha256(admissionSecret, signed);
  return typeof expected === "string" && expected.toLowerCase() === tokens[2];
}

VoxEngine.addEventListener(AppEvents.Started, function () {
  admissionSecret = VoxEngine.getSecretValue("GAFUS_VOX_ADMISSION_SECRET");
  if (!admissionSecret || admissionSecret.length < 32) {
    VoxEngine.terminate();
    return;
  }
  conference = VoxEngine.createConference({ hd_audio: true });
  conference.addEventListener(ConferenceEvents.Stopped, function () {
    conference = null;
    VoxEngine.terminate();
  });
  setTimeout(function () {
    if (conference) conference.stop();
    VoxEngine.terminate();
  }, 120 * 60 * 1000);
});

VoxEngine.addEventListener(AppEvents.CallAlerting, function (event) {
  const call = event.call;
  if (!conference || participants >= 2 || !isAllowed(event)) {
    call.reject();
    return;
  }
  if (idleStop !== null) {
    clearTimeout(idleStop);
    idleStop = null;
  }
  participants += 1;
  let counted = true;
  call.addEventListener(CallEvents.Disconnected, function () {
    if (!counted) return;
    counted = false;
    participants = Math.max(0, participants - 1);
    if (participants === 0) {
      idleStop = setTimeout(function () {
        if (participants === 0 && conference) conference.stop();
      }, 60 * 1000);
    }
  });
  call.answer();
  conference.add({ call: call, mode: "FORWARD", direction: "BOTH", scheme: event.scheme });
});
