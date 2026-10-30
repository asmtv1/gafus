/** Owner-pet photo replacement with DB-first visibility and safe media cleanup.
 * Core owns authorization + serial DB updates; this pure coordinator deals
 * solely with the non-atomic boundary between a private object and a row.
 */
export interface PetPhotoReplacement {
  checkOwner(): Promise<void>;
  upload(): Promise<string>;
  /** Returns the previous persisted storage location, under an owner row lock. */
  writeOwnerPhoto(location:string): Promise<string | null>;
  readOwnerPhoto(): Promise<string | null | undefined>;
  deleteStorageObject(location:string): Promise<void>;
  /** Our own unique candidate path if S3 PUT succeeded but its ACK was lost. */
  candidatePath:string;
  onCleanupFailure?(phase:"rollback"|"previous",error:unknown):void;
}

/** An unknown DB commit is *never* permission to delete a potentially
 * committed new object. A committed write remains visible even if its
 * acknowledgement was lost. No retries of upload/SQL are performed here. */
export async function replaceOwnerPetPhoto(d:PetPhotoReplacement):Promise<string>{
  await d.checkOwner();
  let stored:string|undefined;
  let attemptMade=false;
  let former:string|null=null;
  let writeAttempted=false;
  let committed=false;
  let resultUnknown=false;
  try {
    attemptMade=true;
    stored=await d.upload();
    writeAttempted=true;
    former=await d.writeOwnerPhoto(stored);
    const verified=await d.readOwnerPhoto();
    if(verified!==stored)throw Error("PET_PHOTO_DB_READBACK_UNCONFIRMED");
    committed=true;
  } catch(error) {
    if(!attemptMade)throw error;
    // An unsuccessful transaction may actually have committed. Query *only*
    // our owner row. If the read fails, defer cleanup rather than risk loss.
    if(writeAttempted){
      try {
        const persisted=await d.readOwnerPhoto();
        if(persisted===stored&&stored){committed=true;}
        else if(persisted!==undefined){resultUnknown=false;}
        else resultUnknown=true;
      } catch {resultUnknown=true;}
    }
    if(committed&&stored){
      // Database commit was independently confirmed by owner READ. Caller
      // can return the new location; later GC handles any prior orphan.
      return stored;
    }
    if(!resultUnknown){
      try{await d.deleteStorageObject(stored??d.candidatePath);}
      catch(failure){d.onCleanupFailure?.("rollback",failure);}
    }
    throw error;
  }
  if(!committed||!stored)throw Error("PET_PHOTO_UNCONFIRMED");
  if(former&&former!==stored){
    try{await d.deleteStorageObject(former);}
    catch(error){d.onCleanupFailure?.("previous",error);}
  }
  return stored;
}
