import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

describe('Mobile photo retry remains per-file and entirely client-side',()=>{
  it('Chat2 retains the original picker source and only retries the failed local chip',()=>{
    const source=read('../../../features/chat2/Chat2RoomScreen.tsx');
    expect(source).toContain('uri:f.uri, sourcePhoto:f, uploading:true');
    expect(source).toContain('async function uploadOnePhoto(localId: string, source: ImagePicker.ImagePickerAsset)');
    expect(source).toContain('prepared = await prepareUploadPhoto(source)');
    expect(source).toContain('function retryOnePhoto(localId: string)');
    expect(source).toContain('photoRetryMessage(cause)');
    expect(source).toContain('`Повторить обработку фото ${file.name}`');
    expect(source).toContain('item.localId === localId');
  });
  it('Questions preserves failed photo asset, prevents submit until retry/removal',()=>{
    const source=read('../../../features/questions/ui.tsx');
    expect(source).toContain('const [failedPhotos, setFailedPhotos]');
    expect(source).toContain('onBusy(busy || failedPhotos.length > 0)');
    expect(source).toContain('async function retryOne(key:number)');
    expect(source).toContain('await uploadOne(failed.asset,key)');
    expect(source).toContain('`Повторить обработку фото ${item.asset.fileName ?? item.key}`');
    expect(source).toContain('photos.length + failedPhotos.length >= QUESTION_LIMITS.photos');
  });
  it('Gallery ties a retained source to owner+epoch and checks ambiguous S3 writes',()=>{
    const source=read('../../../features/gallery/uploads.tsx');
    expect(source).toContain('const cachedSources = useRef(new Map');
    expect(source).toContain('remembered?.epoch === epoch');
    expect(source).toContain('remembered.ownerId === capturedActor.ownerId');
    expect(source).toContain('const usable =');
    expect(source).toContain('`Повторить обработку фото ${task.filename}`');
    expect(source).toContain('task.status === "unknown" || task.status === "cancelling"');
  });
  it('Moments and their comments only retry the selected failed photo',()=>{
    const screens=read('../../../features/feed/screens.tsx');
    const queue=read('../../../../../../packages/core-client/src/feed/publication-client.ts');
    expect(screens).toContain('file.kind === "video" || file.kind === "photo"');
    expect(screens).toContain('mobileFeedPublications.retryFile(item.id, file.requestId)');
    expect(queue).toContain('void run(job,requestId)');
    expect(queue).toContain('(!onlyRequestId || asset.requestId === onlyRequestId)');
    expect(screens).toContain('retryCommentPhoto = async(requestId:string)');
    expect(screens).toContain('confirmedCommentMedia.current.set(requestId,mediaId)');
    expect(screens).toContain('commentPostAttempted=true');
    expect(screens).toContain('`Повторить обработку фото ${file.filename}`');
  });
});
