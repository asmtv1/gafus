import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** Deferred Core binding for the existing anonymous public-profile GET. */
import { getPublicProfile } from "@gafus/core/services/user";
import { profileRows } from "./profile-rows-instance.js";
import { createReadPublicProfileApplication } from "../application/read-public-profile.js";

export const readPublicProfileApplication = createReadPublicProfileApplication({
  loadPublicProfile: (username) => withCorrelatedUseCase("user.public_profile.read", () => getPublicProfile(username, profileRows)),
});
