import {describe,it,expect} from "vitest";
import {prepareHonoPetPhoto} from "./pet-photo-file";
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,1,2]);
describe("server-enforced pet image media path",()=>{
  it("normalizes client filename to trusted MIME extension before Core/S3",async()=>{
    const file=new File([png],"../client.svg",{type:"image/png"});
    const safe=await prepareHonoPetPhoto(file);
    expect(safe.name).toBe("pet-photo.png");
    expect(safe.type).toBe("image/png");
    expect(new Uint8Array(await safe.arrayBuffer())).toEqual(png);
  });
  it("rejects mismatched or unsupported content before any storage IO",async()=>{
    const mismatch=new File([new Uint8Array([1,2,3,4])],"x.PNG",{type:"image/png"});
    await expect(prepareHonoPetPhoto(mismatch)).rejects.toThrow("PET_IMAGE_INVALID_BYTES");
    await expect(prepareHonoPetPhoto(new File([png],"x.svg",{type:"image/svg+xml"})))
      .rejects.toThrow("PET_IMAGE_INVALID_FILE");
    await expect(prepareHonoPetPhoto(new File([],"x.jpg",{type:"image/jpeg"})))
      .rejects.toThrow("PET_IMAGE_INVALID_FILE");
  });
  it("enforces 2 MiB without parsing oversized upload bytes",async()=>{
    const oversized=new File([new Uint8Array(2*1024*1024+1)],"x.png",{type:"image/png"});
    await expect(prepareHonoPetPhoto(oversized)).rejects.toThrow("PET_IMAGE_INVALID_FILE");
  });
});
