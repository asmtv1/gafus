/** Deferred Core binding for the existing anonymous public-profile GET. */
import { getPublicProfile } from "@gafus/core/services/user";
import { createReadPublicProfileApplication } from "../application/read-public-profile.js";

export const readPublicProfileApplication = createReadPublicProfileApplication({
  loadPublicProfile: (username) => getPublicProfile(username),
});
