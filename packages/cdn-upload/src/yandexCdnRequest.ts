import { constants, createHash, sign } from "node:crypto";

let iam: { token: string; expires: number; fingerprint: string } | undefined;
async function cdnIamToken() {
  const raw = process.env.CDN_CLEANUP_SERVICE_ACCOUNT_KEY_B64
    ? Buffer.from(process.env.CDN_CLEANUP_SERVICE_ACCOUNT_KEY_B64,"base64").toString("utf8")
    : process.env.CDN_CLEANUP_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("CLEANUP_CDN_UNCONFIGURED");
  // Key rotation must never re-use an IAM token minted for an old account.
  const fingerprint = createHash("sha256").update(raw).digest("hex");
  if (iam && iam.fingerprint === fingerprint && iam.expires > Date.now()) return iam.token;
  const key = JSON.parse(raw) as { id: string; service_account_id: string; private_key: string };
  if (!key.id || !key.service_account_id || !key.private_key)
    throw new Error("CLEANUP_CDN_UNCONFIGURED");
  const time = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "PS256", kid: key.id, typ: "JWT" })}.${encode({
    iss: key.service_account_id,
    aud: "https://iam.api.cloud.yandex.net/iam/v1/tokens",
    iat: time,
    exp: time + 3600,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: key.private_key,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  }).toString("base64url");
  const response = await fetch("https://iam.api.cloud.yandex.net/iam/v1/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jwt: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("CLEANUP_IAM_FAILED");
  const result = (await response.json()) as { iamToken?: string };
  if (!result.iamToken) throw new Error("CLEANUP_IAM_FAILED");
  iam = { token: result.iamToken, expires: Date.now() + 50 * 60_000, fingerprint };
  return iam.token;
}

export async function cdnRequest(path: string, body?: { paths: string[] }) {
  const token = await cdnIamToken();
  const url = body
    ? `https://cdn.api.cloud.yandex.net/cdn/v1/${path}`
    : `https://operation.api.cloud.yandex.net/${path}`;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`CLEANUP_CDN_HTTP_${response.status}`);
  const result = (await response.json()) as { id?: string; done?: boolean; error?: unknown };
  if (result.error) throw new Error("CLEANUP_CDN_OPERATION_FAILED");
  return result;
}
