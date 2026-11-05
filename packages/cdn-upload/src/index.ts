export type { StreamFileFromCDNResult } from "./uploadToCDN";
export {
  accountPublicKey,
  DUAL_PROVIDER_CLEANUP_MARKER,
  accountStorageTargets,
  createAccountStorageCleaner,
  startAccountCdnPurge,
  accountCdnPurgeDone,
} from "./accountStorageCleanup";
export type { AccountStorageScope } from "./accountStorageCleanup";
export { vetVisitFileKeys, uploadVetVisitFile, vetVisitMediaUrl } from "./vetVisitStorage";
export {
  copyObjectInCDN,
  deleteFileFromCDN,
  deleteFolderFromCDN,
  downloadFileFromCDN,
  getSignedDownloadUrl,
  uploadReadableStreamToCDN,
  streamFileFromCDN,
  uploadBufferToCDN,
  uploadFileToCDN,
} from "./uploadToCDN";
export { extractVideoIdFromCdnUrl, getCDNUrl, getRelativePathFromCDNUrl, isCDNUrl } from "./utils";
export {
  getUserAvatarPath,
  getPetDocumentPath,
  getPetPhotoPath,
  getStepImagePath,
  getCourseImagePath,
  getArticleImagePath,
  getExamVideoPath,
} from "./pathHelpers";

export {
  privateMediaEnabled,
  privateMediaKindForUpload,
  privateMediaLocation,
  parsePrivateMediaLocation,
  uploadPrivateUserMedia,
  signPrivateUserMedia,
  deletePrivateUserMedia,
} from "./privateUserMedia";

export { beginBegetCdnPurge, begetCdnPurgeDone, isBegetCacheableObjectKey } from "./begetCdnPurge";

export {
  isIsolatedAvatarPath,
  isIsolatedAvatarLocation,
  uploadIsolatedAvatar,
  presentIsolatedAvatarUrl,
  deleteIsolatedAvatarLocation,
  isolatedAvatarLocationFromOwnPath,
} from "./isolatedAvatarMedia";

// GAFUS Refactor-only private attachment storage (no production path).
export {
  chat2SniffMime,
  chat2ReservePrivateObjectKey,
  chat2UploadPrivateImageOrPdf,
  chat2SignedPrivateMedia,
  chat2DeletePrivateMedia,
} from "./chat2Media";

// Cloud.ru Chat2 V2, disabled until isolated Refactor API cutover.
export { chat2V2DirectUploadForm, chat2V2CheckOriginal, chat2V2ClientSmallKey, chat2V2ClientSmallPost,
  chat2V2FinishClientWebp, chat2V2DeleteObjects } from "./chat2V2PublicMedia";

// Questions-only V2 image storage (private incoming and renditions).
export { questionsV2Storage, questionsV2PresignedPost, questionsV2Head,
  questionsV2Marker, questionsV2IsMarker, questionsV2SignedRead, questionsV2PublicDelivery, questionsV2Delivery,
  questionsV2Delete, questionsV2ClientSmallKey, questionsV2ClientSmallPost,
  questionsV2FinishClientWebp } from "./questionsV2Media";

export { signClientWebpStaging, verifyClientWebp, copyVerifiedClientWebp,
  clientWebpRenditionsMatchAspect } from "./clientPhotoRenditions.js";
export type { VerifiedClientWebp } from "./clientPhotoRenditions.js";

export {verifyClientMp4,copyVerifiedClientMp4} from "./clientVideoMp4.js";

export {chat2V2FinishClientMp4} from "./chat2V2PublicMedia.js";

export {chat2V2ClientVideoPosterPost,chat2V2ClientVideoPosterKey} from "./chat2V2PublicMedia.js";

export { questionsV2CleanupKeys } from "./questionsV2Cleanup.js";
export type { QuestionsV2CleanupKind, QuestionsV2CleanupIdentity } from "./questionsV2Cleanup.js";
