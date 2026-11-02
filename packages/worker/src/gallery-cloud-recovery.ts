/** Gallery's durable Core queue decides whether a paid Cloud wake-up is due. */
import { hasDueGalleryCloudWork } from "@gafus/core/services/gallery";
import { createCloudruGalleryPoolDispatcher } from "./cloudru-media-dispatcher.js";

export function createGalleryCloudRecoveryTick(input: {
  hasDue: (now: Date) => Promise<boolean>;
  dispatch: ReturnType<typeof createCloudruGalleryPoolDispatcher>;
  now?: () => Date;
}) {
  let running = false;
  return async () => {
    if (running) return { skipped: true, dispatched: 0 };
    running = true;
    try {
      if (!await input.hasDue(input.now?.() ?? new Date())) return { dispatched: 0 };
      return await input.dispatch();
    } finally {
      running = false;
    }
  };
}

export function createProductionGalleryCloudRecoveryTick(
  dispatch = createCloudruGalleryPoolDispatcher(),
) {
  return createGalleryCloudRecoveryTick({
    hasDue: at => hasDueGalleryCloudWork(undefined, at), dispatch,
  });
}
