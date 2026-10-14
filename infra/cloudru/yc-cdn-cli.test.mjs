import assert from "node:assert/strict";
import { runYcCdn } from "./yc-cdn-cli.mjs";

function mock(responses) {
  const calls = [];
  const delays = [];
  const warnings = [];
  const run = (bin, args, options) => {
    calls.push({ bin, args, options });
    return responses[calls.length - 1] ?? responses.at(-1);
  };
  return {
    calls,
    delays,
    warnings,
    options: { run, wait: (ms) => delays.push(ms), warn: (msg) => warnings.push(msg) },
  };
}
const ok = { status: 0, stdout: '{"id":"safe"}' };
const deadline = {
  status: 1,
  stderr: "rpc error: code = DeadlineExceeded desc = secret-do-not-print",
};

{
  const fake = mock([deadline, deadline, ok]);
  assert.deepEqual(runYcCdn(["cdn", "resource", "get", "--id", "some-id"], fake.options), {
    id: "safe",
  });
  assert.equal(fake.calls.length, 3);
  assert.deepEqual(fake.delays, [1000, 2000]);
  assert.equal(fake.warnings.length, 2);
  assert(!fake.warnings.join(" ").includes("secret-do-not-print"));
  assert.deepEqual(fake.calls[0].args.slice(-1), ["--format=json"]);
  assert.equal(fake.calls[0].options.timeout, 55000);
}
{
  const fake = mock([{ status: 1, stderr: "code = Unavailable" }, ok]);
  assert.deepEqual(runYcCdn(["cdn", "origin-group", "list"], fake.options), { id: "safe" });
  assert.equal(fake.calls.length, 2);
}
{
  const fake = mock([{ status: null, error: { code: "ETIMEDOUT" } }, ok]);
  assert.deepEqual(runYcCdn(["cdn", "origin-group", "get"], fake.options), { id: "safe" });
  assert.equal(fake.calls.length, 2);
}
{
  const fake = mock([deadline]);
  assert.throws(
    () => runYcCdn(["cdn", "resource", "get"], fake.options),
    (error) => error.message === "YC_CDN_COMMAND_FAILED_cdn_resource_DeadlineExceeded_EXIT_1",
  );
  assert.equal(fake.calls.length, 4);
  assert.deepEqual(fake.delays, [1000, 2000, 4000]);
}
{
  const fake = mock([deadline, ok]);
  assert.throws(() => runYcCdn(["cdn", "resource", "update"], fake.options), /DeadlineExceeded/);
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.delays.length, 0);
}
{
  const fake = mock([{ status: 1, stderr: "code = PermissionDenied desc = hidden-value" }, ok]);
  assert.throws(
    () => runYcCdn(["cdn", "resource", "get"], fake.options),
    (error) => error.message === "YC_CDN_COMMAND_FAILED_cdn_resource_PermissionDenied_EXIT_1",
  );
  assert.equal(fake.calls.length, 1);
}
console.log("Yandex CDN CLI transient read retries and mutation safeguards PASS");

// A previously unclassified failure of origin-group list blocked production
// even though Gallery had passed and Feed had not been touched. Read-only
// lookups may be safely retried, but they never pass on a persistent failure.
{
  const unknown = { status: 1, stderr: "upstream service rejected request, sensitive-detail" };
  const fake = mock([unknown, ok]);
  assert.deepEqual(runYcCdn(["cdn", "origin-group", "list"], fake.options), { id: "safe" });
  assert.equal(fake.calls.length, 2);
  assert.deepEqual(fake.delays, [1000]);
  assert(!fake.warnings.join(" ").includes("sensitive-detail"));
}
{
  const unknown = { status: 1, stderr: "upstream service rejected request, sensitive-detail" };
  const fake = mock([unknown]);
  assert.throws(
    () => runYcCdn(["cdn", "origin-group", "list"], fake.options),
    (error) => error.message === "YC_CDN_COMMAND_FAILED_cdn_origin-group_UNKNOWN_EXIT_1",
  );
  assert.equal(fake.calls.length, 4);
  assert.deepEqual(fake.delays, [1000, 2000, 4000]);
}
for (const [stderr, code] of [
  ["rpc error: code = Internal desc = redacted-secret", "Internal"],
  ["HTTP 429 Too Many Requests", "HTTP_429"],
  ["502 Bad Gateway", "HTTP_502"],
  ["status code: 503", "HTTP_503"],
]) {
  const fake = mock([{ status: 1, stderr }, ok]);
  assert.deepEqual(runYcCdn(["cdn", "origin-group", "list"], fake.options), { id: "safe" });
  assert.equal(fake.calls.length, 2, code);
  assert(fake.warnings[0].includes(code), code);
}
for (const [stderr, code] of [
  ["rpc error: code = InvalidArgument desc = sensitive", "InvalidArgument"],
  ["rpc error: code = NotFound desc = sensitive", "NotFound"],
  ["401 Unauthorized", "HTTP_401"],
  ["403 Forbidden", "HTTP_403"],
  ["status code: 400", "HTTP_400"],
]) {
  const fake = mock([{ status: 1, stderr }, ok]);
  assert.throws(
    () => runYcCdn(["cdn", "origin-group", "list"], fake.options),
    (error) => error.message.includes(`_${code}_EXIT_1`),
  );
  assert.equal(fake.calls.length, 1, code);
}
{
  const unknown = { status: 1, stderr: "upstream response: sensitive-data" };
  const fake = mock([unknown, ok]);
  assert.throws(() => runYcCdn(["cdn", "resource", "update"], fake.options), /_UNKNOWN_EXIT_1/);
  assert.equal(fake.calls.length, 1);
}
