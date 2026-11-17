# GAFUS local picomatch security fork

Source: official MIT-licensed npm picomatch version 4.0.7.
Fork version: 4.0.8-gafus.1, **not** an upstream release.
Advisory: https://github.com/advisories/GHSA-fc5q-39xc-vjpf
As of 2026-11-18, upstream published no patched version.

The fork changes only lib/parse.js and the package metadata:
- Detect any unescaped wildcard-star branch in repeated extglobs even
  when a single branch is present, including +(*) and +(*a).
- Use the upstream fail-safe literal fallback, avoiding nested unbounded
  quantifiers. Unusual wildcard-bearing repeated extglobs become literals
  intentionally; ordinary globs and safe repeated extglobs continue working.
- Disabling the recursion-depth limit must not disable the ReDoS guard.

The root pnpm override pins every picomatch dependency to the fork.
The previous lockfile had only picomatch 4.0.4 and 4.0.7, so this does
not upgrade a consumer from a different major version.

Blocking release checks:
- node --test scripts/qa/picomatch-redos-fork.test.mjs
- pnpm audit --audit-level high

No advisory suppressions, ignores or security-gate changes are used.
When upstream publishes an audited fix, replace this fork and remove
the override, then run the same release checks.
