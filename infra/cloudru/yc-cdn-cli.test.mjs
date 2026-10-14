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
