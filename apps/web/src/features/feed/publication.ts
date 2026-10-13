import { createFeedPublicationManager, type PublicationAsset } from "@gafus/core/services/feed/publication-client";
import { feedApi } from "./api";
import { uploadFeedBrowserAsset, type FeedBrowserAsset } from "./upload";

export const webFeedPublications = createFeedPublicationManager<FeedBrowserAsset & PublicationAsset>({
  api: feedApi,
  makeId: () => crypto.randomUUID(),
  onRemove: item => { if (item.previewUri?.startsWith("blob:")) URL.revokeObjectURL(item.previewUri); },
  onAssetsReleased: input => {
    for (const { asset } of input.pollOptionImages ?? []) {
      if (asset.previewUri?.startsWith("blob:")) URL.revokeObjectURL(asset.previewUri);
    }
  },
  pollImageStatus: async (postId, asset, mediaId) => {
    const upload = await feedApi.reserveUpload(postId, {
      filename: asset.file.name, kind: "photo", declaredMime: asset.file.type as "image/jpeg" | "image/png" | "image/webp",
      declaredBytes: asset.file.size, clientRequestId: asset.requestId,
    });
    if (upload.mediaId !== mediaId) throw new Error("Не совпадает изображение опроса.");
    return upload.status === "ready" ? "ready" :
      ["failed", "expired", "cancelled"].includes(upload.status) ? "failed" : "pending";
  },
  upload: (postId, asset, progress) => uploadFeedBrowserAsset(postId, asset, progress),
});
