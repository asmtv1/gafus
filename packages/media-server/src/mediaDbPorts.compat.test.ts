import { describe, expect, it } from "vitest";
import {
  FEED_POST_INCLUDE as legacyPost,
  FEED_AUTHOR_SELECT as legacyAuthor,
} from "./mediaDbPorts.js";
import {
  FEED_POST_INCLUDE as sharedPost,
  FEED_AUTHOR_SELECT as sharedAuthor,
} from "@gafus/media-shared/media-db-ports";

describe("media-server public Feed/Gallery port backwards compatibility", () => {
  it("exports the exact shared selectors, not a duplicate or alternative query graph", () => {
    expect(legacyAuthor).toBe(sharedAuthor);
    expect(legacyPost).toBe(sharedPost);
  });
});
