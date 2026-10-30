import {
  createFeedClient, type FeedTransport,
} from "@gafus/types";
import { apiRequest } from "../../shared/api/client";

/** Single same-origin browser transport for all Feed/Core operations. */
const feedTransport: FeedTransport = async <T>(
  path: string, options: NonNullable<Parameters<FeedTransport>[1]> = {},
): Promise<T> => apiRequest<T>(`/api/v1/feed/${path}`, {
  method: options.method,
  ...(options.body === undefined ? {} : { json: options.body }),
});

export const feedClient = createFeedClient(feedTransport);
