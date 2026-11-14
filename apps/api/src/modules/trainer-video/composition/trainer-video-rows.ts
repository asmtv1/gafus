/**
 * Single production composition: Core domain policy plus unchanged
 * media-server SQL projection/owner-fenced mutation methods.
 */
import {
  registerTrainerVideo as registerCoreVideo,
  markTrainerVideoTranscodingFailed as markCoreVideoFailed,
  getDeletePayload as getCoreDeletePayload,
  deleteTrainerVideoRecord as deleteCoreVideoRecord,
  updateTrainerVideoName as updateCoreVideoName,
  getTrainerVideos as listCoreVideos,
  getMultipleVideoStatuses as readCoreStatuses,
  getVideoMetadataByUrl as readCoreMetadata,
  getVideoIdAndPathsFromUrl as readCoreVideoPaths,
  getVideoForPlaybackCheck as readCorePlayback,
  type TrainerVideoPersistencePort,
} from "@gafus/core/services/trainerVideo";
import type { RegisterTrainerVideoInput } from "@gafus/core/services/trainerVideo";
import {
  createTrainerVideoRow,
  markTrainerVideoTranscodingFailedRow,
  readTrainerVideoDeleteRow,
  clearTrainerStepVideoReferences,
  clearTrainerTemplateVideoReferences,
  deleteTrainerVideoRow,
  readTrainerVideoOwnerRow,
  renameTrainerVideoForOwner,
  readTrainerVideosRows,
  readTrainerVideoStatusRows,
  readTrainerVideoMetadataRow,
  readTrainerVideoManifestRow,
  readTrainerVideoPlaybackRow,
} from "@gafus/media-server/trainer-video-rows";

export const videoPersistence: TrainerVideoPersistencePort = {
  createTrainerVideoRow,
  markTrainerVideoTranscodingFailedRow,
  readTrainerVideoDeleteRow,
  clearTrainerStepVideoReferences,
  clearTrainerTemplateVideoReferences,
  deleteTrainerVideoRow,
  readTrainerVideoOwnerRow,
  renameTrainerVideoForOwner,
  readTrainerVideosRows,
  readTrainerVideoStatusRows,
  readTrainerVideoMetadataRow,
  readTrainerVideoManifestRow,
  readTrainerVideoPlaybackRow,
};
export const registerTrainerVideo = (input: RegisterTrainerVideoInput) =>
  registerCoreVideo(videoPersistence, input);
export const markTrainerVideoTranscodingFailed = (id: string, reason: string) =>
  markCoreVideoFailed(videoPersistence, id, reason);
export const getDeletePayload = (id: string, actor: string, role: string) =>
  getCoreDeletePayload(videoPersistence, id, actor, role);
export const deleteTrainerVideoRecord = (id: string, fullCdnUrl: string | null) =>
  deleteCoreVideoRecord(videoPersistence, id, fullCdnUrl);
export const updateTrainerVideoName = (id: string, actor: string, name: string | null) =>
  updateCoreVideoName(videoPersistence, id, actor, name);
export const getTrainerVideos = (actor: string, options: { forAdmin?: boolean } = {}) =>
  listCoreVideos(videoPersistence, actor, options);
export const getMultipleVideoStatuses = (ids: string[]) => readCoreStatuses(videoPersistence, ids);
export const getVideoMetadataByUrl = (url: string | null | undefined) =>
  readCoreMetadata(videoPersistence, url);
export const getVideoIdAndPathsFromUrl = (url: string) => readCoreVideoPaths(videoPersistence, url);
export const getVideoForPlaybackCheck = (id: string) => readCorePlayback(videoPersistence, id);
