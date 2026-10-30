import {describe,it,expect} from "vitest";
import {trustedPetPhotoUrl,sameTrustedPetPhotoObject} from "./petPhotoUrl";
const photo="https://storage.yandexcloud.net/gafus-media/uploads/users/owner_A/pets/pet_A/photo.jpg";
describe("public pet avatar URL security projection",()=>{
  it("accepts both original public user-pet hosts, no query or signing",()=>{
    expect(trustedPetPhotoUrl(photo)).toBe(photo);
    const old=photo.replace("storage.yandexcloud.net/gafus-media/",
      "gafus-media.storage.yandexcloud.net/").replace(".jpg",".gif");
    expect(trustedPetPhotoUrl(old)).toBe(old);
  });
  it("accepts signed local pet object only in exact isolated dev bucket and deadline",()=>{
    const origin="http://127.0.0.1:5173";
    const path="http://127.0.0.1:9000/gafus-refactor-documents-test/"+
      "documents/uploads/users/owner_A/pets/pet_A/"+
      "11111111-1111-4111-8111-111111111111.webp";
    const stamp=new Date(Date.now()).toISOString().replace(/[-:]/g,"")
      .replace(/\.\d{3}Z$/,"Z");
    const query=`X-Amz-Date=${stamp}&X-Amz-Expires=300&X-Amz-Signature=`;
    const first=path+"?"+query+"signed1";
    const rotated=path+"?"+query+"signed2";
    expect(trustedPetPhotoUrl(first,origin)).toBe(first);
    expect(sameTrustedPetPhotoObject(first,rotated,origin)).toBe(true);
    expect(sameTrustedPetPhotoObject(first,first.replace("pet_A","pet_B"),origin))
      .toBe(false);
    for(const bad of [first.replace("/pets/pet_A/","/pets/pet_A/documents/"),
      first.replace("127.0.0.1:9000","localhost:9000"),
      first.replace("/gafus-refactor-documents-test/","/gafus-refactor-feed-test/"),
      first.replace("X-Amz-Expires=300","X-Amz-Expires=99999"),
      path]){
      expect(trustedPetPhotoUrl(bad,origin),bad).toBeNull();
    }
    expect(trustedPetPhotoUrl(first,"https://real-gafus.example")).toBeNull();
  });
  it("rejects arbitrary CDN paths, signed links, encoded traversal and externals",()=>{
    for(const bad of [photo+"?X-Amz-Signature=private",
      photo.replace("/pets/pet_A/","/documents/"),
      photo.replace("/pet_A/","/%2e%2e/"),
      photo.replace("storage.yandexcloud.net","storage.yandexcloud.net.evil.test"),
      photo.replace("https:","http:"),photo.replace("photo.jpg","photo.svg"),
      photo.replace("/users/","/courses/")]){
      expect(trustedPetPhotoUrl(bad),bad).toBeNull();
    }
  });
});
