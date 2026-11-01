/** Bounded Cloud.ru asynchronous PATCH reconciliation. The API can return an
 * earlier ready revision or a not-ready desired revision for several minutes.
 * Never accept a different third image, project, or a partial configuration.
 */
export async function waitForGalleryJobRollout({
  get, jobName, projectId, previousImage, desiredImage, isDesired,
  timeoutMs=240_000,
  intervalMs=5_000,
  clock=()=>Date.now(),
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
}) {
  const start=clock();
  let last={status:'unreadable',imageMatches:false,configMatches:false};
  for (;;) {
    try {
      const state=await get();
      if(state?.name!==jobName||state?.projectId!==projectId)
        throw Error('CLOUDRU_POSTPATCH_IDENTITY_'+jobName);
      const image=state.template?.containers?.[0]?.image;
      if(image!==previousImage && image!==desiredImage)
        throw Error('CLOUDRU_POSTPATCH_UNEXPECTED_IMAGE_'+jobName);
      last={status:String(state.status??'missing').replace(/[^a-zA-Z0-9_-]/g,''),
        imageMatches:image===desiredImage,
        configMatches:isDesired(state)};
      if(state.status==='ready' && last.configMatches)return true;
    } catch(error) {
      const message=String(error?.message??'');
      // Only retry transport timeout and rate-limits/provider 5xx. Never
      // swallow authentication, identity, or unexpected image drift.
      if(error?.name!=='TimeoutError' &&
         !/^CLOUDRU_GET_HTTP_(429|500|502|503|504)_/.test(message))throw error;
      last={...last,status:'transient-read-error'};
    }
    const remaining=timeoutMs-(clock()-start);
    if(remaining<=0)throw Error('CLOUDRU_POSTPATCH_VERIFICATION_'+jobName+
      '_status_'+last.status+'_image_'+String(last.imageMatches)+
      '_config_'+String(last.configMatches));
    await sleep(Math.min(intervalMs,remaining));
  }
}
