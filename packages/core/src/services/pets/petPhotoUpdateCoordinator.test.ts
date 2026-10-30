import {describe,expect,it,vi} from "vitest";
import {replaceOwnerPetPhoto,type PetPhotoReplacement} from "./petPhotoUpdateCoordinator";
const next="isodev-avatar:documents/uploads/users/u/pets/p/new.jpg";
const old="isodev-avatar:documents/uploads/users/u/pets/p/old.jpg";
function setup():{d:PetPhotoReplacement;steps:string[];state:{value:string|null}}{
  const steps:string[]=[];
  const state:{value:string|null}={value:old};
  const d:PetPhotoReplacement={candidatePath:"users/u/pets/p/new.jpg",
    checkOwner:vi.fn(async()=>{steps.push("owner-check");}),
    upload:vi.fn(async()=>{steps.push("upload");return next;}),
    writeOwnerPhoto:vi.fn(async(value:string)=>{steps.push("db-write");
      const former=state.value;state.value=value;return former;}),
    readOwnerPhoto:vi.fn(async()=>{steps.push("db-read");return state.value;}),
    deleteStorageObject:vi.fn(async(value:string)=>{steps.push("delete:"+value);}),
  };
  return {d,steps,state};
}
describe("owner-scoped S3 + SQL replacement coordinator",()=>{
  it("does not delete old photo until owner DB update and readback commit",async()=>{
    const {d,steps}=setup();
    await expect(replaceOwnerPetPhoto(d)).resolves.toBe(next);
    expect(steps).toEqual(["owner-check","upload","db-write","db-read","delete:"+old]);
  });
  it("foreign owner fails before either S3 or SQL",async()=>{
    const {d,steps}=setup();
    d.checkOwner=async()=>{steps.push("owner-deny");throw Error("FOREIGN_OWNER");};
    await expect(replaceOwnerPetPhoto(d)).rejects.toThrow("FOREIGN_OWNER");
    expect(steps).toEqual(["owner-deny"]);
  });
  it("rolled-back SQL cleans only the candidate and retains old photo",async()=>{
    const {d,steps,state}=setup();
    d.writeOwnerPhoto=async()=>{steps.push("db-failed");throw Error("PG_ROLLBACK");};
    await expect(replaceOwnerPetPhoto(d)).rejects.toThrow("PG_ROLLBACK");
    expect(state.value).toBe(old);
    expect(steps).toEqual(["owner-check","upload","db-failed","db-read","delete:"+next]);
  });
  it("unknown commit followed by owner GET confirming new DB row is success",async()=>{
    const {d,steps,state}=setup();
    d.writeOwnerPhoto=async(value)=>{state.value=value;throw Error("ACK_LOST_AFTER_COMMIT");};
    await expect(replaceOwnerPetPhoto(d)).resolves.toBe(next);
    expect(state.value).toBe(next);
    expect(steps).toEqual(["owner-check","upload","db-read"]);
    expect(d.deleteStorageObject).not.toHaveBeenCalled();
  });
  it("cannot read DB after commit failure: no unsafe deletion of possibly committed object",async()=>{
    const {d,steps}=setup();
    d.writeOwnerPhoto=async()=>{throw Error("UNKNOWN_SQL");};
    d.readOwnerPhoto=async()=>{throw Error("SQL_READ_DOWN");};
    await expect(replaceOwnerPetPhoto(d)).rejects.toThrow("UNKNOWN_SQL");
    expect(steps).toEqual(["owner-check","upload"]);
    expect(d.deleteStorageObject).not.toHaveBeenCalled();
  });
  it("lost S3 PUT ACK deletes only own unique candidate, not previous photo",async()=>{
    const {d,steps,state}=setup();
    d.upload=async()=>{throw Error("PUT_ACK_LOST");};
    await expect(replaceOwnerPetPhoto(d)).rejects.toThrow("PUT_ACK_LOST");
    expect(state.value).toBe(old);
    expect(steps).toEqual(["owner-check","delete:"+d.candidatePath]);
  });
  it("failed previous-media cleanup cannot undo committed DB success",async()=>{
    const {d,state}=setup();
    const onFailure=vi.fn();d.onCleanupFailure=onFailure;
    d.deleteStorageObject=async()=>{throw Error("S3_DOWN");};
    await expect(replaceOwnerPetPhoto(d)).resolves.toBe(next);
    expect(state.value).toBe(next);
    expect(onFailure).toHaveBeenCalledWith("previous",expect.any(Error));
  });
});
