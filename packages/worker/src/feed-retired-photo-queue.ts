import {createRetiredFeedPhotoQueueTick,createCurrentRetiredFeedPhotoQueueTick} from "@gafus/core/services/feed";
export {createRetiredFeedPhotoQueueTick};
let tick:ReturnType<typeof createRetiredFeedPhotoQueueTick>|undefined;
export async function runRetiredFeedPhotoQueueTick(){
 if(process.env.FEED_RETIRED_PHOTO_QUEUE_SWEEP_ENABLED!=='true')return;
 tick??=createCurrentRetiredFeedPhotoQueueTick();
 await tick();
}
