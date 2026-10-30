/**
 * Expo Image failures are scoped to an exact signed URL, not just media ID.
 * A fresh authenticated GET with a new signature must reset the error view.
 */
export function questionPhotoReadIdentity(photo:{
  id:string;url:string;smallUrl?:string|null;
}):string {
  return photo.id+":"+(photo.smallUrl??photo.url);
}
