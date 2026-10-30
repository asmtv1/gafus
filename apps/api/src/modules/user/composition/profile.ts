/**
 * AG1-001 composition root: bind pure user application ports to existing Core.
 * No business projection/repository implementation belongs here.
 */
import { getUserProfileForApi, updateUserProfile } from "@gafus/core/services/user";
import { createReadProfileApplication } from "../application/read-profile.js";
import { createUpdateProfileApplication } from "../application/update-profile.js";

export const readProfileApplication = createReadProfileApplication({
  loadProfile: getUserProfileForApi,
});

export const updateProfileApplication = createUpdateProfileApplication({
  persist: updateUserProfile,
});
