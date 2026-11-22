# GAFUS iOS 1.7.5 — OTA source for App Store build 101

This release branch is based on immutable native source `f6e6994e1167e9dbdf4c9ab13bbfbcaa7168c9d2`, matching the registry's iOS 1.7.5 build 101. The source maintains `apps/mobile/app.json` and `apps/mobile/package.json` at 1.7.5, while Android remains 1.7.6 on `main`.

Native fingerprint for `ios / production / 1.7.5`: `284430e1d2a1a137be0a456b69731c40c1a266d608669c7b00e2d34b1f5150f1`. All changes in this branch must stay outside native fingerprint inputs (including `app.json`, `app.config.js`, `package.json`, `pnpm-lock.yaml`, native/plugins dirs). Recheck after every source edit.

The `ios-public-yookassa` profile is only an OTA content profile and does NOT confer Apple StoreKit External Purchase Link entitlement. It must not be publicly enabled until Apple storefront policy and release gates are satisfied. This branch does not modify production, sign a production OTA, or deploy checkout.

Release entrypoint: `.github/workflows/gafus-self-hosted-ota-production.yml` on `main` with `source_sha` set to this branch's exact pushed HEAD, `platform=ios`, `runtime_version=1.7.5` and `payment_content=ios-public-yookassa`. The server/native registry must first validate an actual archived Store artifact, device attestation, and the full signed source fingerprint.
