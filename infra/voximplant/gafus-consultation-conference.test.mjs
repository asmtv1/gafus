import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const scenario = readFileSync(new URL("./gafus-consultation-conference.js", import.meta.url), "utf8");
const secret = "sample-secret-only-tests-".padEnd(64, "c");
const room = "gafus_" + "a".repeat(30);
const username = "g_u_" + "b".repeat(30);
const now = 1_800_000_000;

function simulate(secretValue = secret) {
  const handlers = {};
  const listeners = {};
  const admitted = [];
  let terminated = 0;
  const timers = [];
  const context = {
    require(name) { assert.ok(["conference", "crypto"].includes(name)); },
    Modules: { Conference: "conference", Crypto: "crypto" },
    VoxEngine: {
      addEventListener(event, fn) { handlers[event] = fn; },
      createConference() { return {
        addEventListener(event, fn) { listeners[event] = fn; },
        add({ call }) { admitted.push(call); },
        stop() { listeners.Stopped?.(); },
      }; },
      getSecretValue() { return secretValue; },
      terminate() { terminated++; },
    },
    AppEvents: { Started: "Started", CallAlerting: "CallAlerting" },
    ConferenceEvents: { Stopped: "Stopped" },
    CallEvents: { Disconnected: "Disconnected" },
    Crypto: { hmac_sha256(key, data) { return createHmac("sha256", key).update(data).digest("hex"); } },
    Date: class { static now() { return now * 1000; } },
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
  };
  runInNewContext(scenario, context);
  handlers.Started();
  function offer({ roomId = room, userId = username, expiry = now + 90, wrongSignature = false,
                   fromURI, customData } = {}) {
    const signature = createHmac("sha256", secret)
      .update("v1:" + roomId + ":" + userId + ":" + expiry).digest("hex");
    const events = {};
    const call = {
      rejected: false, answered: false,
      reject() { this.rejected = true; },
      answer() { this.answered = true; },
      addEventListener(event, fn) { events[event] = fn; },
      disconnect() { events.Disconnected?.(); },
    };
    handlers.CallAlerting({
      call, destination: roomId,
      fromURI: fromURI ?? ("sip:" + userId + "@gafus.test.voximplant.com"),
      customData: customData ?? (expiry + "." + (wrongSignature ? "0".repeat(64) : signature)),
    });
    return call;
  }
  return { offer, admitted, timers, getTerminated: () => terminated };
}

test("only the authorized two SDK identities can join the booked room", () => {
  const app = simulate();
  assert.equal(app.offer().answered, true);
  assert.equal(app.offer({ userId: "g_u_" + "c".repeat(30) }).answered, true);
  assert.equal(app.admitted.length, 2);
  assert.equal(app.offer().rejected, true);
});

test("rejects missing, invalid, expired or mismatched admission proofs", () => {
  const app = simulate();
  assert.equal(app.offer({ wrongSignature: true }).rejected, true);
  assert.equal(app.offer({ expiry: now - 1 }).rejected, true);
  assert.equal(app.offer({ expiry: now + 140 }).rejected, true);
  assert.equal(app.offer({ fromURI: "sip:intruder@voximplant.com" }).rejected, true);
  assert.equal(app.offer({ fromURI: "sip:g_u_" + "c".repeat(30) + "@example.voximplant.com" }).rejected, true);
  assert.equal(app.offer({ customData: "" }).rejected, true);
  assert.equal(app.offer({ roomId: "gafus_public" }).rejected, true);
  assert.equal(app.admitted.length, 0);
});

test("missing VoxEngine application secret blocks all calls", () => {
  const app = simulate("");
  assert.equal(app.offer().rejected, true);
  assert.equal(app.admitted.length, 0);
  assert.ok(app.getTerminated() >= 1);
});

test("session stops after both participants leave and reconnect grace expires", () => {
  const app = simulate();
  const call = app.offer();
  call.disconnect();
  const grace = app.timers.find(t => t.ms === 60_000);
  assert.ok(grace);
  grace.fn();
  assert.ok(app.getTerminated() >= 1);
});
