import { createOtaManifestRoutes } from "../modules/mobile-ota/manifest-protocol.js";
import { mobileOtaManifestRepository } from "@gafus/mobile-ota-server/repository";

// Explicit opt-in. Existing EAS binaries and release policy are unchanged.
export const mobileOtaRoutes = createOtaManifestRoutes(mobileOtaManifestRepository, {
  appId: "gafus",
  environment: process.env.MOBILE_OTA_DELIVERY_ENV,
  testerSecret: process.env.MOBILE_OTA_INSTALLATION_HASH_KEY,
});
