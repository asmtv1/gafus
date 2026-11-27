/** Stable, compiled API runtime entry point for owner-bound walk persistence.
 * Keep implementation in walksService without exposing a private source path. */
export {
  listCompletedDogWalks,
  syncCompletedDogWalks,
  writeCompletedDogWalks,
  readDogWalkChanges,
  syncDogWalkTrackPoints,
  listDogWalkTrackPoints,
  listDeletedDogWalkIds,
  deleteDogWalk,
  readWalkGpsOperationalMetrics,
  type WalkGpsSnapshot,
} from "./walksService.js";
