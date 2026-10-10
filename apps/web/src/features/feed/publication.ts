import { createFeedPublicationManager, type PublicationAsset } from "@gafus/core/services/feed/publication-client";
import { feedApi } from "./api";
import { uploadFeedBrowserAsset, type FeedBrowserAsset } from "./upload";

export const webFeedPublications = createFeedPublicationManager<FeedBrowserAsset & PublicationAsset>({
  api: feedApi,
  makeId: () => crypto.randomUUID(),
  onRemove: item => { if (item.previewUri?.startsWith("blob:")) URL.revokeObjectURL(item.previewUri); },
  upload: (postId, asset, progress) => uploadFeedBrowserAsset(postId, asset, progress),
});
