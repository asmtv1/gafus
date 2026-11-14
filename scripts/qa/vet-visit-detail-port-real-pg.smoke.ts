/**
 * Disposable PostgreSQL proof: authenticated-owner policy + actual pets-server
 * SQL reader, without any cloud storage, user PHI or live provider.
 */
import assert from "node:assert/strict";
import { prisma } from "@gafus/prisma";
import { getOwnVetVisitDetail as coreRead } from "../../packages/core/src/services/pets/g1VetVisitDetailRead.review.js";
import {
  getOwnVetVisitDetail as sqlRead,
  VetVisitDetailNotFoundError as serverError,
} from "@gafus/pets-server/vet-visit-detail";
import { VetVisitDetailNotFoundError as sharedError } from "@gafus/pets-shared/vet-visit-error";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
  process.env.GAFUS_VET_VISIT_REAL_PG !== "1" ||
  url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
  url.pathname !== "/gafus_vet_visits_test") {
  throw Error("REFUSING_NON_DISPOSABLE_VET_VISIT_PORT_PG");
}

async function main() {
  assert.equal(serverError, sharedError, "single 404 class across Core and SQL adapter");
  const [owner, other] = await Promise.all([
    prisma.user.create({ data: { username: "synthetic_vet_owner", password: "synthetic" } }),
    prisma.user.create({ data: { username: "synthetic_vet_other", password: "synthetic" } }),
  ]);
  const pet = await prisma.pet.create({ data: {
    ownerId: owner.id, name: "Synthetic Dog", type: "DOG", breed: "Synthetic", birthDate: new Date("2021-01-01"),
  } });
  const visit = await prisma.petVetVisit.create({data:{
    ownerId:owner.id,petId:pet.id,visitedOn:new Date("2026-10-01"),
    specialty:"Synthetic", diagnosis:"SYNTHETIC_PRIVATE_CLINICAL_NOTES",
  }});
  const dto = await coreRead(owner.id,pet.id,visit.id,sqlRead);
  assert.deepEqual(
    {id:dto.id,petId:dto.petId,visitedOn:dto.visitedOn,attachments:dto.attachments},
    {id:visit.id,petId:pet.id,visitedOn:"2026-10-01",attachments:[]},
  );
  for(const [actor,petId,visitId] of [
    [other.id,pet.id,visit.id],
    [owner.id,pet.id,"foreign_missing_visit"],
    [owner.id,"../bad",visit.id],
  ]) {
    await assert.rejects(
      coreRead(actor,petId,visitId,sqlRead),
      (error:unknown)=>error instanceof sharedError &&
        error.status===404 && error.code==="VET_VISIT_NOT_FOUND" &&
        !error.message.includes("SYNTHETIC_PRIVATE"),
    );
  }
  assert.equal(await prisma.petVetVisit.count({where:{id:visit.id,ownerId:owner.id}}),1);
  console.log("VET_DETAIL_PORT_REAL_PG_PASS: owner-only DTO, foreign/missing/malformed indistinguishable 404, no cloud access, shared error identity");
}
main().then(async()=>prisma.$disconnect()).catch(async error=>{
  console.error(error);await prisma.$disconnect();process.exitCode=1;
});
