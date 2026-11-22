import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import config from "../metro.config.js";
import { checkoutComponent, paymentProfile } from "./ota-payment-profile.mjs";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const components = path.join(root, "features/app-subscription/components");
const checkout = checkoutComponent(paymentProfile());
const platform = process.env.GAFUS_OTA_TARGET_PLATFORM;
if (!["ios", "android"].includes(platform) || (checkout && platform !== process.env.OTA_PLATFORM))
  throw Error("OTA_EXPORT_CHECKOUT_CONTEXT_REQUIRED");

// The Expo transform inlines public environment values. A shared cache can
// reuse a previous export's revision even when the process environment differs.
config.cacheVersion = `gafus-ota-${randomUUID()}`;
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, targetPlatform) => {
  if (
    checkout &&
    targetPlatform === platform &&
    name === "./OptionalCardCheckout" &&
    context.originModulePath === path.join(components, `AppSubscriptionPaywall.${platform}.tsx`)
  ) {
    return { type: "sourceFile", filePath: path.join(components, `${checkout}.tsx`) };
  }
  return (resolve ?? context.resolveRequest)(context, name, targetPlatform);
};

export default config;
