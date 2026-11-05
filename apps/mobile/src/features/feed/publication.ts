import * as Crypto from "expo-crypto";
import { createFeedPublicationManager, type PublicationAsset } from "@gafus/core-client/feed/publication-client";
import { feedApi } from "@/shared/lib/api/feed";
import { uploadPickedFeedMedia, releaseFeedPickedMedia, type FeedPickedMedia } from "./uploads";

export const mobileFeedPublications = createFeedPublicationManager<FeedPickedMedia & PublicationAsset>({
  api: feedApi,
  makeId: Crypto.randomUUID,
  pollIntervalMs: 2_000,
  preserveDraftTextBeforeUpload: true,
  pollImageStatus: async (postId, asset, mediaId) => {
    const upload = await feedApi.reserveUpload(postId, {
      filename: asset.filename, kind: "photo", declaredMime: asset.mime,
      declaredBytes: asset.bytes, clientRequestId: asset.requestId,
    });
    if (upload.mediaId !== mediaId) throw new Error("Не совпадает изображение опроса.");
    return upload.status === "ready" ? "ready" :
      ["failed", "expired", "cancelled"].includes(upload.status) ? "failed" : "pending";
  },
  upload: (postId, asset, progress) => uploadPickedFeedMedia(postId, asset, progress),
  onAssetsReleased: input => {
    for (const file of input.files) releaseFeedPickedMedia(file);
    for (const { asset } of input.pollOptionImages ?? []) releaseFeedPickedMedia(asset);
  },
});
