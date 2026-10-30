import {describe,expect,it} from "vitest";
import {questionPhotoReadIdentity} from "./photoReadIdentity";

describe("Questions native expired photo recovery",()=>{
  it("a refreshed signed GET for the same media clears previous URL-specific error",()=>{
    const first={id:"photo-1",url:"https://s3.example/m.webp?signature=old",
      smallUrl:"https://s3.example/s.webp?signature=old"};
    const second={...first,smallUrl:"https://s3.example/s.webp?signature=fresh"};
    const denied=new Set([questionPhotoReadIdentity(first)]);
    expect(denied.has(questionPhotoReadIdentity(first))).toBe(true);
    expect(denied.has(questionPhotoReadIdentity(second))).toBe(false);
  });
  it("separates two media IDs and uses main URL when no thumbnail is present",()=>{
    const a=questionPhotoReadIdentity({id:"a",url:"https://s3.example/photo"});
    const b=questionPhotoReadIdentity({id:"b",url:"https://s3.example/photo"});
    expect(a).not.toBe(b);
  });
});
