import type { z } from "zod/v3";
import type {
  FeedPostCreateInput,
  FeedPostEditorDto,
  FeedPublishInput,
  FeedRevisionInput,
} from "@gafus/types";
import { feedCreatePostSchema, feedParse, feedPublishSchema, feedRevisionSchema } from "./schemas";

export interface FeedPostCommands {
  createDraft(actorId: string, draft: z.output<typeof feedCreatePostSchema>): Promise<string>;
  saveRevision(
    actorId: string,
    postId: string,
    revision: z.output<typeof feedRevisionSchema>,
  ): Promise<void>;
  publishRevision(actorId: string, postId: string): Promise<void>;
  deletePost(actorId: string, postId: string): Promise<void>;
}

export function createFeedPostCommands(
  commands: FeedPostCommands,
  assertActor: (actorId: string) => Promise<void>,
  editor: (actorId: string, postId: string) => Promise<FeedPostEditorDto>,
) {
  return {
    async create(actorId: string, input: FeedPostCreateInput) {
      await assertActor(actorId);
      const draft = feedParse(feedCreatePostSchema, input);
      return editor(actorId, await commands.createDraft(actorId, draft));
    },
    async saveRevision(actorId: string, postId: string, input: FeedRevisionInput) {
      await assertActor(actorId);
      const revision = feedParse(feedRevisionSchema, input);
      await commands.saveRevision(actorId, postId, revision);
      return editor(actorId, postId);
    },
    async publish(actorId: string, postId: string, input: FeedPublishInput) {
      await assertActor(actorId);
      feedParse(feedPublishSchema, input);
      await commands.publishRevision(actorId, postId);
      return editor(actorId, postId);
    },
    async remove(actorId: string, postId: string) {
      await assertActor(actorId);
      await commands.deletePost(actorId, postId);
      return { id: postId };
    },
  };
}
