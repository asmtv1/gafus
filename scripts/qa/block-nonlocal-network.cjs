"use strict";

/**
 * Preload only for isolated QA tests. Blocks Node TCP/TLS connections to
 * non-loopback hosts. Not a guarantee against child processes or other
 * networking mechanisms; test suites still require service isolation.
 */
const net = require("node:net");
const tls = require("node:tls");
const allowed = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);
function check(args) {
  const first = args[0];
  if (typeof first === "string" && first.startsWith("/")) return;
  if (first && typeof first === "object" && (first.path || first.socket)) return;
  let host = "localhost";
  if (first && typeof first === "object") {
    host = first.host || first.hostname || "localhost";
  } else if (typeof first === "number" && typeof args[1] === "string") {
    host = args[1];
  } else if (typeof first === "string") {
    throw new Error("[GAFUS_QA_NETWORK_BLOCKED] Unexpected nonlocal destination");
  }
  if (!allowed.has(String(host).toLowerCase())) {
    throw new Error("[GAFUS_QA_NETWORK_BLOCKED] Nonlocal TCP/TLS connection refused");
  }
}
const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  check(args);
  return originalSocketConnect.apply(this, args);
};
const originalConnect = net.connect;
net.connect = net.createConnection = function (...args) {
  check(args);
  return originalConnect.apply(this, args);
};
const originalTlsConnect = tls.connect;
tls.connect = function (...args) {
  check(args);
  return originalTlsConnect.apply(this, args);
};
