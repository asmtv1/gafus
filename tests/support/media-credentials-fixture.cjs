/** Unit-only filesystem boundary. Production adapters still validate their
 * canonical workspace, modes, ownership and exact file names. Never touch
 * operator credentials; redirect only the three credential paths to a fresh
 * temporary directory and restore the Node builtins when the test ends.
 */
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "../..");
const syntheticMediaCredentials = {
  accessKeyId: "UNITTESTACCESSKEY".padEnd(32, "0"),
  secretAccessKey: "SyntheticUnitTestSecretKey".padEnd(64, "0"),
};
const syntheticCdnCredentials = { gallery: "A".repeat(32), feed: "B".repeat(28) };

function installMediaCredentialFixture(options = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "gafus-media-unit-")));
  fs.chmodSync(base, 0o700);
  const scratch = join(root, ".local-pg-scratch");
  const paths = new Map([[scratch, base]]);
  for (const name of ["nonprod-s3", "web4-nonprod-s3"]) {
    const dir = join(base, name);
    fs.mkdirSync(dir, { mode: 0o700 });
    const file = join(dir, "credentials.json");
    fs.writeFileSync(file, JSON.stringify(syntheticMediaCredentials), { mode: 0o600, flag: "wx" });
    paths.set(join(scratch, name), dir);
    paths.set(join(scratch, name, "credentials.json"), file);
  }
  const cdnFile = join(base, "live-media-cdn-readonly.json");
  paths.set(join(scratch, "live-media-cdn-readonly.json"), cdnFile);
  if (options.readonlyCdn !== false) {
    fs.writeFileSync(cdnFile, JSON.stringify(syntheticCdnCredentials), { mode: 0o600, flag: "wx" });
  }
  const mapPath = path => typeof path === "string" ? paths.get(path) : undefined;
  const realpath = fs.realpathSync;
  const lstat = fs.lstatSync;
  const read = fs.readFileSync;
  fs.lstatSync = (path, ...args) => lstat(mapPath(path) ?? path, ...args);
  fs.readFileSync = (path, ...args) => read(mapPath(path) ?? path, ...args);
  fs.realpathSync = (path, ...args) => {
    const mapped = mapPath(path);
    if (!mapped) return realpath(path, ...args);
    // Resolve actual fixture first: missing files still throw, and symlinks
    // outside the fixture are rejected by the production path equality check.
    const resolved = realpath(mapped, ...args);
    return resolved === mapped ? path : resolved;
  };
  Object.assign(fs.realpathSync, { native: realpath.native });
  syncBuiltinESMExports();
  let restored = false;
  return {
    cdnFile,
    credentialFile: join(base, "nonprod-s3", "credentials.json"),
    restore() {
      if (restored) return;
      restored = true;
      fs.realpathSync = realpath;
      fs.readFileSync = read;
      fs.lstatSync = lstat;
      syncBuiltinESMExports();
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

exports.syntheticMediaCredentials = syntheticMediaCredentials;
exports.syntheticCdnCredentials = syntheticCdnCredentials;
exports.installMediaCredentialFixture = installMediaCredentialFixture;
