// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,expect,it,vi} from 'vitest';

const photos=vi.hoisted(()=>({upload:vi.fn()}));
vi.mock('./feedMediaTransfer',()=>({
  uploadMomentPhoto:photos.upload,
  prepareMomentPhotoBeforePublish:vi.fn(async()=>undefined),
  uploadMomentVideo:vi.fn(),
  validateMomentPhoto:vi.fn(),
  validateMomentVideo:vi.fn(),
}));
import {MomentComments} from './MomentComments';

describe('Moment comment per-image client processing retry',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('restarts only the failed photo and preserves the server-confirmed sibling',async()=>{
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    let n=0;
    vi.stubGlobal('crypto',{randomUUID:()=>`550e8400-e29b-41d4-a716-${String(++n).padStart(12,'0')}`});
    const NativeURL=URL;
    class PreviewURL extends NativeURL {
      static createObjectURL=vi.fn(()=>`blob:moment-comment-${++n}`);
      static revokeObjectURL=vi.fn();
    }
    vi.stubGlobal('URL',PreviewURL);
    const uploadCount=new Map<string,number>();
    photos.upload.mockReset().mockImplementation(async({file}:{file:File})=>{
      const count=(uploadCount.get(file.name)??0)+1;
      uploadCount.set(file.name,count);
      if(file.name==='bad.jpg'&&count===1)throw Error('S3 connection timeout');
      return file.name==='bad.jpg'?'confirmed-bad':'confirmed-ok';
    });
    const requests:unknown[]=[];
    vi.stubGlobal('fetch',vi.fn(async(uri:string,init?:RequestInit)=>{
      if(init?.method==='POST'){
        requests.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({success:true,data:{id:'comment-1',postId:'post-1'}}));
      }
      return new Response(JSON.stringify({success:true,data:{items:[],nextCursor:null}}));
    }));
    const host=document.createElement('div');document.body.appendChild(host);
    const root=createRoot(host);
    const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
    try{
      await act(async()=>root.render(createElement(QueryClientProvider,{client:cache},
        createElement(MomentComments,{postId:'post-1',userId:'user-1'}))));
      const picker=host.querySelector<HTMLInputElement>('input.moment-comment-file-input')!;
      Object.defineProperty(picker,'files',{configurable:true,value:[
        new File([new Uint8Array(64)],'bad.jpg',{type:'image/jpeg'}),
        new File([new Uint8Array(64)],'good.jpg',{type:'image/jpeg'}),
      ]});
      await act(async()=>picker.dispatchEvent(new Event('change',{bubbles:true})));
      await act(async()=>host.querySelector('form')!.dispatchEvent(
        new Event('submit',{bubbles:true,cancelable:true})));
      await vi.waitFor(()=>expect(host.querySelector<HTMLButtonElement>(
        'button[aria-label="Повторить обработку фото bad.jpg"]')).not.toBeNull());
      expect(host.querySelector('button[aria-label="Повторить обработку фото good.jpg"]'))
        .toBeNull();
      expect(uploadCount.get('bad.jpg')).toBe(1);
      expect(uploadCount.get('good.jpg')).toBe(1);
      expect(requests).toHaveLength(0);
      await act(async()=>host.querySelector<HTMLButtonElement>(
        'button[aria-label="Повторить обработку фото bad.jpg"]')!.click());
      await vi.waitFor(()=>expect(uploadCount.get('bad.jpg')).toBe(2));
      expect(uploadCount.get('good.jpg')).toBe(1);
      await act(async()=>host.querySelector('form')!.dispatchEvent(
        new Event('submit',{bubbles:true,cancelable:true})));
      await vi.waitFor(()=>expect(requests).toHaveLength(1));
      expect(requests[0]).toMatchObject({mediaIds:['confirmed-bad','confirmed-ok']});
      expect(uploadCount.get('bad.jpg')).toBe(2);
      expect(uploadCount.get('good.jpg')).toBe(1);
    }finally{
      await act(async()=>root.unmount());cache.clear();host.remove();
    }
  });
});
