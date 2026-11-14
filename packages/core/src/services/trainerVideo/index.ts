export {
  registerTrainerVideo,
  markTrainerVideoTranscodingFailed,
  getDeletePayload,
  deleteTrainerVideoRecord,
  updateTrainerVideoName,
  getTrainerVideos,
  getSignedVideoToken,
  getMultipleVideoStatuses,
  getVideoMetadataByUrl,
  getVideoIdAndPathsFromUrl,
  getVideoForPlaybackCheck,
} from "./trainerVideoService";

export type {
  TrainerVideoPersistencePort,
  GetDeletePayloadResult,
  VideoStatusResult,
  VideoMetadata,
} from "./trainerVideoService";

export {
  registerTrainerVideoSchema,
  updateTrainerVideoNameSchema,
  deleteTrainerVideoSchema,
  getTrainerVideosOptionsSchema,
} from "./schemas";
export type {
  RegisterTrainerVideoInput,
  UpdateTrainerVideoNameInput,
  DeleteTrainerVideoInput,
  GetTrainerVideosOptions,
} from "./schemas";
