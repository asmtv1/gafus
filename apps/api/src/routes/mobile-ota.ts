import { createOtaManifestRoutes } from "../modules/mobile-ota/manifest-protocol.js";
import { mobileOtaManifestRepository } from "../modules/mobile-ota/repository.js";

// Explicit opt-in. Existing EAS binaries and release policy are unchanged.
export const mobileOtaRoutes = createOtaManifestRoutes(mobileOtaManifestRepository, {
  appId: "gafus",
  environment: process.env.MOBILE_OTA_DELIVERY_ENV,
});
