import * as Crypto from "expo-crypto";
import { createFeedPublicationManager, type PublicationAsset } from "@gafus/core/services/feed/publication-client";
import { feedApi } from "@/shared/lib/api/feed";
import { uploadPickedFeedMedia, type FeedPickedMedia } from "./uploads";

export const mobileFeedPublications = createFeedPublicationManager<FeedPickedMedia & PublicationAsset>({
  api: feedApi,
  makeId: Crypto.randomUUID,
  upload: (postId, asset, progress) => uploadPickedFeedMedia(postId, asset, progress),
});
