import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{questionV2MediaTask:{findUnique:m.read,update:m.write}}}));
import {readQuestionPhotoMediaTask} from "./questionPhotoTaskRead.js";
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue(null)});
describe("question media manifest read projection",()=>{
 it("never reads private source keys or owner IDs",async()=>{
   await expect(readQuestionPhotoMediaTask("photo-1")).resolves.toBeNull();
   expect(m.read).toHaveBeenCalledExactlyOnceWith({where:{photoId:"photo-1"},select:{status:true,manifest:true}});
   expect(m.write).not.toHaveBeenCalled();
 });
 it("does not query a missing photo id",async()=>{
   expect(await readQuestionPhotoMediaTask("")).toBeNull();
   expect(m.read).not.toHaveBeenCalled();
 });
});
