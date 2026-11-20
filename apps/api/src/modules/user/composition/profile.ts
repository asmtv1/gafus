/**
 * AG1-001 composition root: bind pure user application ports to existing Core.
 * No business projection/repository implementation belongs here.
 */
import { getUserProfileForApi, updateUserProfile } from "@gafus/core/services/user";
import { profileRows } from "./profile-rows-instance.js";
import { createReadProfileApplication } from "../application/read-profile.js";
import { createUpdateProfileApplication } from "../application/update-profile.js";

export const readProfileApplication = createReadProfileApplication({
  loadProfile: (userId) => getUserProfileForApi(userId, profileRows),
});

export const updateProfileApplication = createUpdateProfileApplication({
  persist: (userId, data) => updateUserProfile(userId, data, profileRows),
});
