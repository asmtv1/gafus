import { FeedError } from "./errors";

type PollImage = {
  postId: string;
  ownerId: string;
  kind: string;
  status: string;
  thumbKey: string | null;
  fullKey: string | null;
};

export function assertRevisionCanPublish(
  input: { post: { id: string; authorId: string }; publishedMediaCount: number; text: string },
  poll: { options: { imageMedia: PollImage | null }[] } | null,
) {
  const { post } = input;
  if (input.publishedMediaCount === 0 && !input.text.trim() && !poll) {
    throw new FeedError("EMPTY_POST", undefined, 400);
  }
  if (
    poll?.options.some(
      (option) =>
        !option.imageMedia ||
        option.imageMedia.postId !== post.id ||
        option.imageMedia.ownerId !== post.authorId ||
        option.imageMedia.kind !== "photo" ||
        option.imageMedia.status !== "ready" ||
        !option.imageMedia.thumbKey ||
        !option.imageMedia.fullKey,
    )
  ) {
    throw new FeedError("VALIDATION_ERROR", "Изображение варианта опроса недоступно", 400);
  }
}
