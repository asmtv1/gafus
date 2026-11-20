export function feedPossibleOutputKeys(
  ownerId: string,
  postId: string,
  mediaId: string,
  kind: "photo" | "video" = "video",
) {
  const base = `media/v2/${mediaId}/v1/`;
  const outputs =
    kind === "photo"
      ? ["image/s.webp", "image/m.webp", "image/l.webp"]
      : ["poster.webp", "video/360.mp4", "video/720.mp4"];
  return outputs.map((name) => base + name);
}

interface CleanupAsset {
  id: string;
  kind: "photo" | "video";
  smallKey: string | null;
  thumbKey: string | null;
  fullKey: string | null;
  posterKey: string | null;
  mp4Keys: readonly string[];
}

export function planFeedPostCleanup({
  postId,
  ownerId,
  at,
  media,
  uploads,
  jobs,
}: {
  postId: string;
  ownerId: string;
  at: Date;
  media: readonly CleanupAsset[];
  uploads: readonly {
    sourceKey: string;
    ownerId: string;
    postExpiresAt: Date;
    reservationExpiresAt: Date;
  }[];
  jobs: readonly {
    sourceKeys: readonly string[];
    targetKeys: readonly string[];
    leaseUntil: Date | null;
  }[];
}) {
  const prefix = `posts/${ownerId}/${postId}/`;
  const keys = [
    ...new Set(
      [
        ...uploads.map((item) => item.sourceKey),
        ...media.flatMap((item) => [
          item.smallKey,
          item.thumbKey,
          item.fullKey,
          item.posterKey,
          ...(item.mp4Keys ?? []),
          ...feedPossibleOutputKeys(ownerId, postId, item.id, item.kind),
        ]),
        ...jobs.flatMap((item) => [...item.sourceKeys, ...item.targetKeys]),
      ].filter(
        (key): key is string =>
          !!key &&
          (key.startsWith(prefix) ||
            // The post may have received media from commenters with their own source keys.
            uploads.some(
              (upload) =>
                upload.sourceKey === key &&
                key.startsWith("posts/" + upload.ownerId + "/" + postId + "/"),
            ) ||
            media.some((item) => key.startsWith(`media/v2/${item.id}/v1/`))),
      ),
    ),
  ];
  const deadline = Math.max(
    at.getTime(),
    ...uploads.flatMap((item) => [
      item.postExpiresAt.getTime(),
      item.reservationExpiresAt.getTime(),
    ]),
    ...jobs.map((item) => item.leaseUntil?.getTime() ?? 0),
  );
  return { keys, availableAt: new Date(deadline + 60_000) };
}
