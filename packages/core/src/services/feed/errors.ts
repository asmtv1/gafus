import { FEED_ERROR_MESSAGES } from "../../../../types/src/feed";
export class FeedError extends Error {
  constructor(
    public readonly code: string,
    message: string = FEED_ERROR_MESSAGES[code as keyof typeof FEED_ERROR_MESSAGES] ?? "Не удалось выполнить действие.",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "FeedError";
  }
}
