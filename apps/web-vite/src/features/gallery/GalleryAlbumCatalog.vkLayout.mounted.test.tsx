// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {GalleryAlbums} from "./GalleryAlbums";
import type {AlbumSummary,GalleryPage} from "./galleryApi";

const ownerId="owner-catalog", username="owner";
const album=(id:string,photoCount:number,visible:boolean,cover:string|null):AlbumSummary=>({
  id,ownerId,ownerUsername:username,name:id==="pet"?"Мой пёс":"Для себя",
  description:null,isVisible:visible,canEdit:true,photoCount,coverPhotoId:null,
  coverThumbUrl:cover,urlsExpireAt:"2099-12-31T12:00:00.000Z",
});
const page:GalleryPage<AlbumSummary>={items:[
  album("pet",3,true,"https://cdn.example.test/cover.jpg?signature=synthetic"),
  album("private",0,false,null),
],enabled:true,nextCursor:null,isOwner:true,usedSlots:3,limit:20};
let host:HTMLDivElement,root:Root,query:QueryClient;
const flush=async()=>{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
};
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement("div"); document.body.append(host);
  root=createRoot(host);
  query=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  query.clear();host.remove();
});
describe("VK-inspired GAFUS album index",()=>{
  it("keeps real route links, cover privacy and counts inside an image-first grid",async()=>{
    await act(async()=>root.render(<QueryClientProvider client={query}>
      <GalleryAlbums userId={ownerId} username={username} routeMode manage
        listAlbums={async()=>page}/>
    </QueryClientProvider>));
    await flush();
    expect(host.querySelector("h1")?.textContent).toBe("Фотоальбомы");
    expect(host.textContent).not.toContain("2 альбома");
    const links=[...host.querySelectorAll<HTMLAnchorElement>(
      ".gallery-album-grid > li > .gallery-album-card")];
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("/profile/albums/pet");
    expect(links[0]?.textContent).toContain("3 фото");
    expect(links[0]?.querySelector("img")?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(links[1]?.getAttribute("href")).toBe("/profile/albums/private");
    expect(links[1]?.textContent).toContain("0 фото");
    expect(links[1]?.textContent).toContain("Только вы");
    expect(links[1]?.textContent).toContain("Нет обложки");
    expect(links[1]?.querySelector("img")).toBeNull();
    expect(links[0]?.textContent).not.toContain("Только вы");
    expect(host.querySelector('button[data-gafus-shared-button="primary"]')?.textContent)
      .toContain("Создать альбом");
    expect(host.querySelector('a[href="/profile"]')).toBeNull();
    expect(host.querySelector('.gallery-album-card [class*="catalogCardInfo"]'))
      .not.toBeNull();
  });
});
