/**
 * Native Question images use the original bytes whenever Sharp supports
 * their format. Only iOS HEIC/HEIF needs conversion to JPEG before S3 POST.
 * Filename is merely a picker fallback, never a server trust boundary.
 */
export type QuestionNativeMime="image/jpeg"|"image/png"|"image/webp";
export function classifyQuestionNativePhoto(input:{
  mimeType?:string|null;fileName?:string|null;
}):QuestionNativeMime|"convert-heic" {
  const ext=input.fileName?.split(".").pop()?.toLowerCase();
  const fromName=ext==="jpg"||ext==="jpeg"?"image/jpeg":
    ext==="png"?"image/png":
    ext==="webp"?"image/webp":
    ext==="heic"?"image/heic":
    ext==="heif"?"image/heif":"";
  const mime=input.mimeType?.trim().toLowerCase()||fromName;
  if(mime==="image/jpeg"||mime==="image/jpg")return "image/jpeg";
  if(mime==="image/png")return "image/png";
  if(mime==="image/webp")return "image/webp";
  if(mime==="image/heic"||mime==="image/heif")return "convert-heic";
  throw new Error("Поддерживаются JPG, PNG и WebP");
}
