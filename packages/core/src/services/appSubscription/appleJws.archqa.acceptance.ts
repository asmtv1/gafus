/**
 * Real Apple App Store Server Library ES256 JWS verification against a
 * synthetic OpenSSL CA hierarchy, NOT Apple's production signing key.
 * Separate opt-in Vitest config; no Apple HTTP, existing DB, or user data.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Environment, SignedDataVerifier, VerificationException, VerificationStatus } from "@apple/app-store-server-library";
import { handleAppleAppSubscriptionNotification } from "./paymentService";

const bundle = "ru.gafus.app";
const base64url = (buffer: Buffer) => buffer.toString("base64url");
let dir = "";
let trusted: SignedDataVerifier;
let leafKey = "";
let certificates: string[] = [];
function openssl(...args: string[]) {
  execFileSync("openssl", args, { cwd: dir, timeout: 8_000, stdio: ["ignore", "pipe", "pipe"] });
}
const jws = (data: Record<string, unknown>, overrideHeader: Record<string, unknown> = {}) => {
  const header = { alg: "ES256", x5c: certificates, ...overrideHeader };
  const content = `${base64url(Buffer.from(JSON.stringify(header)))}.${base64url(Buffer.from(JSON.stringify(data)))}`;
  const signature = sign("sha256", Buffer.from(content), { key: leafKey, dsaEncoding: "ieee-p1363" });
  return `${content}.${base64url(signature)}`;
};
const notification = (environment: string = Environment.SANDBOX, bundleId = bundle) => ({
  notificationType: "TEST", notificationUUID: randomUUID(),
  signedDate: Date.now(), data: { bundleId, environment, appAppleId: 1234 },
});

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "gafus-archqa-apple-jws-"));
  openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "root.key");
  openssl("req", "-new", "-x509", "-sha256", "-days", "2", "-key", "root.key",
    "-subj", "/CN=GAFUS disposable synthetic Apple test root", "-out", "root.pem",
    "-addext", "basicConstraints=critical,CA:TRUE",
    "-addext", "keyUsage=critical,keyCertSign,cRLSign");
  openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "intermediate.key");
  openssl("req", "-new", "-key", "intermediate.key", "-subj", "/CN=GAFUS synthetic intermediate",
    "-out", "intermediate.csr");
  writeFileSync(join(dir, "intermediate.ext"), [
    "basicConstraints=critical,CA:TRUE,pathlen:0", "keyUsage=critical,keyCertSign,cRLSign",
    "1.2.840.113635.100.6.2.1=DER:05:00",
  ].join("\n"));
  openssl("x509", "-req", "-in", "intermediate.csr", "-CA", "root.pem", "-CAkey", "root.key",
    "-CAcreateserial", "-days", "2", "-sha256", "-extfile", "intermediate.ext", "-out", "intermediate.pem");
  openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "leaf.key");
  openssl("req", "-new", "-key", "leaf.key", "-subj", "/CN=GAFUS synthetic leaf",
    "-out", "leaf.csr");
  writeFileSync(join(dir, "leaf.ext"), [
    "basicConstraints=critical,CA:FALSE", "keyUsage=critical,digitalSignature",
    "1.2.840.113635.100.6.11.1=DER:05:00",
  ].join("\n"));
  openssl("x509", "-req", "-in", "leaf.csr", "-CA", "intermediate.pem", "-CAkey", "intermediate.key",
    "-CAcreateserial", "-days", "2", "-sha256", "-extfile", "leaf.ext", "-out", "leaf.pem");
  for (const name of ["root", "intermediate", "leaf"]) {
    openssl("x509", "-in", `${name}.pem`, "-outform", "der", "-out", `${name}.der`);
  }
  leafKey = readFileSync(join(dir, "leaf.key"), "utf8");
  certificates = ["leaf", "intermediate", "root"].map(name => readFileSync(join(dir, `${name}.der`)).toString("base64"));
  trusted = new SignedDataVerifier([readFileSync(join(dir, "root.der"))], false,
    Environment.SANDBOX, bundle);
});
afterAll(() => {
  vi.unstubAllEnvs();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("synthetic Apple JWS cryptography and production trust rejection", () => {
  it("accepts correctly signed ES256 notification with synthetic root and Apple certificate OIDs", async () => {
    const payload = notification();
    const decoded = await trusted.verifyAndDecodeNotification(jws(payload));
    expect(decoded.notificationUUID).toBe(payload.notificationUUID);
    expect(decoded.notificationType).toBe("TEST");
  });
  it("rejects post-signature tampering, wrong bundle, wrong environment, missing x5c", async () => {
    const token = jws(notification());
    const [header, , signature] = token.split(".");
    const forged = `${header}.${base64url(Buffer.from(JSON.stringify(notification())))}.${signature}`;
    await expect(trusted.verifyAndDecodeNotification(forged)).rejects.toBeInstanceOf(VerificationException);
    await expect(trusted.verifyAndDecodeNotification(jws(notification(Environment.SANDBOX, "evil.example"))))
      .rejects.toMatchObject({ status: VerificationStatus.INVALID_APP_IDENTIFIER });
    await expect(trusted.verifyAndDecodeNotification(jws(notification(Environment.PRODUCTION))))
      .rejects.toMatchObject({ status: VerificationStatus.INVALID_ENVIRONMENT });
    await expect(trusted.verifyAndDecodeNotification(jws(notification(), { x5c: [] })))
      .rejects.toBeInstanceOf(VerificationException);
  });
  it("actual GAFUS handler rejects synthetic trusted-by-test chain under Apple Root G3; no DB side effects", async () => {
    vi.stubEnv("APPLE_BUNDLE_ID", bundle);
    vi.stubEnv("APPLE_USE_SANDBOX", "true");
    await expect(handleAppleAppSubscriptionNotification({ signedPayload: jws(notification()) }))
      .rejects.toBeInstanceOf(VerificationException);
  });
});
