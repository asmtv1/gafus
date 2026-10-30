/**
 * A removed/FAILED Questions V2 photo may retain a READY S3 marker while
 * durable cleanup is pending. The marker alone must never allow reattachment.
 */
export function canBindQuestionPhoto(
  photo:{id:string;url:string;storagePath:string},
  acceptedV2PhotoIds:ReadonlySet<string>,
):boolean {
  if(photo.storagePath.startsWith("questions-v2:")){
    return acceptedV2PhotoIds.has(photo.id);
  }
  // Read/delete compatibility only for existing legacy photos.
  return Boolean(photo.url);
}
