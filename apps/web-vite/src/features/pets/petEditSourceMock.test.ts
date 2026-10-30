import {describe,expect,it} from "vitest";
import {classifyPetEditAck,classifyPetReadback,petEditPath,toDraft,
  validatePetEdit} from "./petEditSourceMock";
import type {PetDetails} from "./petApi";
export const pet:PetDetails={
  id:"pet123",name:"Барни",type:"DOG",breed:"Метис",showInProfile:true,
  notes:"Любит прогулки",birthDate:"2020-10-16T00:00:00.000Z",
  weightKg:15.5,heightCm:52,neckGirthCm:35,
  muzzleGirthCm:22,bellyGirthCm:55,
};
describe("Pet owner edit source-only, real Hono PUT DTO",()=>{
  it("P01 exact existing route, path injection forbidden",()=>{
    expect(petEditPath("pet123")).toBe("/api/v1/pets/pet123");
    expect(()=>petEditPath("../admin")).toThrow();
    expect(()=>petEditPath("pet%2Fid")).toThrow();
  });
  it("P02 partial update, no overwritten unchanged or ID",()=>{
    const draft=toDraft(pet);
    draft.name=" Жучка ";draft.weightKg="16,25";draft.notes="";
    const r=validatePetEdit(pet,draft);
    expect(r).toEqual({ok:true,patch:{
      name:"Жучка",weightKg:16.25,notes:"",
    }});
  });
  it("P03 future/invalid birthday and null measurement not synthesized",()=>{
    const draft=toDraft(pet);
    draft.birthDate="2030-01-01";
    expect(validatePetEdit(pet,draft).ok).toBe(false);
    draft.birthDate="2026-02-31";
    expect(validatePetEdit(pet,draft).ok).toBe(false);
    draft.birthDate=toDraft(pet).birthDate;
    draft.weightKg="";
    expect(validatePetEdit(pet,draft)).toMatchObject({
      ok:false,message:expect.stringContaining("Вес изменяется"),
    });
  });
  it("P03a matches actual Hono/Core nullable measurements but never clears weight",()=>{
    const draft=toDraft(pet);
    draft.heightCm="";draft.neckGirthCm="";
    draft.muzzleGirthCm="";draft.bellyGirthCm="";
    expect(validatePetEdit(pet,draft)).toEqual({ok:true,patch:{
      heightCm:null,neckGirthCm:null,muzzleGirthCm:null,bellyGirthCm:null,
    }});
    const partial=toDraft(pet);partial.neckGirthCm="";
    expect(validatePetEdit(pet,partial)).toEqual({ok:true,patch:{neckGirthCm:null}});
    partial.weightKg="";
    expect(validatePetEdit(pet,partial)).toMatchObject({
      ok:false,message:expect.stringContaining("Вес изменяется"),
    });
  });
  it("optional empty breed is omitted from actual Hono update payload",()=>{
    const d=toDraft(pet);d.breed="";d.name="Жучка";
    expect(validatePetEdit(pet,d)).toEqual({ok:true,patch:{name:"Жучка"}});
  });
  it("Next DOB edit accepts DD.MM.YYYY, normalizes ISO and prevents format-only PUT",()=>{
    const d=toDraft(pet);
    d.birthDate="16.10.2020";
    expect(validatePetEdit(pet,d)).toMatchObject({ok:false,
      message:"Изменений для сохранения нет."});
    d.birthDate="17.10.2020";
    expect(validatePetEdit(pet,d)).toEqual({ok:true,patch:{birthDate:"2020-10-17"}});
    d.birthDate="2020-10-17";
    expect(validatePetEdit(pet,d)).toEqual({ok:true,patch:{birthDate:"2020-10-17"}});
    for(const invalid of ["31.02.2020","not-a-date","01.01.1980","01.01.2099"]){
      d.birthDate=invalid;
      expect(validatePetEdit(pet,d).ok).toBe(false);
    }
  });
  it("P04 numeric precision/range follows existing legacy validation",()=>{
    for(const bad of ["0","300","NaN","12.345","-1","1e5"]){
      const draft=toDraft(pet);draft.weightKg=bad;
      expect(validatePetEdit(pet,draft).ok).toBe(false);
    }
    const d=toDraft(pet);d.heightCm="180,5";
    expect(validatePetEdit(pet,d)).toEqual({ok:true,patch:{heightCm:180.5}});
  });
  it("P05 unchanged draft and impossible names never PUT",()=>{
    expect(validatePetEdit(pet,toDraft(pet)).ok).toBe(false);
    for(const name of ["A","123","A".repeat(51)]){
      const draft=toDraft(pet);draft.name=name;
      expect(validatePetEdit(pet,draft).ok).toBe(false);
    }
  });
  it("P06 success exact 200 + matching owner/pet snapshot only mock ACK",()=>{
    const patch={name:"Жучка"};
    expect(classifyPetEditAck({httpStatus:200,success:true,
      data:{...pet,name:"Жучка"}},pet.id,patch))
      .toEqual({kind:"ACK_MOCK"});
    expect(classifyPetEditAck({httpStatus:200,success:true,
      data:{...pet,id:"foreign",name:"Жучка"}},pet.id,patch))
      .toEqual({kind:"UNKNOWN"});
    expect(classifyPetEditAck({httpStatus:200,success:true,
      data:{...pet}},pet.id,patch)).toEqual({kind:"UNKNOWN"});
  });
  it("P07 400/403/404/409 bounded, lostACK/500/503 unknown",()=>{
    for(const status of [400,401,403,404,409,422,429])
      expect(classifyPetEditAck({httpStatus:status,success:false},
        pet.id,{name:"X"})).toEqual({kind:"REJECTED",status});
    for(const status of [500,503,200])
      expect(classifyPetEditAck({httpStatus:status,success:false},
        pet.id,{name:"X"})).toEqual({kind:"UNKNOWN"});
  });
  it("P08 readback match is synthetic only, absence not rollback proof",()=>{
    expect(classifyPetReadback({...pet,name:"Жучка"},
      pet.id,{name:"Жучка"})).toBe("MATCH_MOCK");
    expect(classifyPetReadback({...pet},pet.id,
      {name:"Жучка"})).toBe("NOT_PROVEN");
    expect(classifyPetReadback(null,pet.id,
      {name:"Жучка"})).toBe("NOT_PROVEN");
  });
});
