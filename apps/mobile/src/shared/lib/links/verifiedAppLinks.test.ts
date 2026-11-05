import { describe,expect,it } from "vitest";
import { nativePathForVerifiedGafusUrl as route } from "./verifiedAppLinks";

describe("Android App Links and iOS Universal Links to protected Expo routes",()=>{
  it.each([
    ["https://gafus.ru/feed/post-1","/feed/post-1"],
    ["https://www.gafus.ru/feed/post_2?commentId=c3","/feed/post_2?commentId=c3"],
    ["https://gafus.ru/questions/question-1","/questions/question-1"],
    ["https://www.gafus.ru/chats/room-1","/chats/room-1"],
    ["https://gafus.ru/training/dog-basic","/training/dog-basic"],
    ["https://gafus.ru/training/dog-basic/day-3","/training/dog-basic/day-3"],
    ["https://gafus.ru/moments","/feed"],
    ["https://gafus.ru/moments/new","/feed/create"],
    ["https://gafus.ru/moments/saved","/feed/saved"],
    ["https://gafus.ru/moments/drafts/opaque-id","/feed"],
    ["https://gafus.ru/moments/profile/exampleuser","/feed/profile/exampleuser"],
    ["https://www.gafus.ru/moments/post-1","/feed/post-1"],
    ["https://gafus.ru/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789","/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789"],
  ])("routes trusted HTTPS link %s",(url,expected)=>expect(route(url)).toBe(expected));
  it.each([
    "https://evil.example/feed/post-1",
    "https://gafus.ru.evil.example/feed/post-1",
    "https://gafus.ru@evil.example/feed/post-1",
    "https://username@gafus.ru/feed/post-1",
    "http://gafus.ru/feed/post-1",
    "https://gafus.ru:8443/feed/post-1",
    "https://gafus.ru/feed/%2Fadmin",
    "https://gafus.ru/feed/../private",
    "https://gafus.ru/chats/not-valid\\segment",
    "https://gafus.ru/private/settings",
    "https://gafus.ru/connection/websocket",
    "https://gafus.ru/api/v1/chats/private",
    "https://gafus.ru/reset-password/anything",
    "https://gafus.ru/moments/edit",
  ])("does not grant or forge routes for unsupported link %s",url=>{
    // Moments detail uses valid ids, so `/moments/edit` is a syntactically
    // valid post ID; actual post read ACL remains enforced by the server.
    if(url.endsWith("/moments/edit")) expect(route(url)).toBe("/feed/edit");
    else expect(route(url)).toBeNull();
  });
});
