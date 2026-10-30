/** Original Core requires a safe file extension when deriving its S3 key.
 * Never trust a multipart client's filename, MIME label or empty payload.
 * This adapter keeps a small bounded copy (max 2 MiB) before any Core/S3 IO.
 */
const format: Record<string,string> = {
  "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif",
};
const maxBytes = 2 * 1024 * 1024;
function bytesMatch(mime:string, bytes:Uint8Array):boolean {
  if(mime==="image/jpeg")return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(mime==="image/png")return [137,80,78,71,13,10,26,10]
    .every((value,i)=>bytes[i]===value);
  if(mime==="image/webp")return String.fromCharCode(...bytes.subarray(0,4))==="RIFF"&&
    String.fromCharCode(...bytes.subarray(8,12))==="WEBP";
  if(mime==="image/gif")return ["GIF87a","GIF89a"].includes(
    String.fromCharCode(...bytes.subarray(0,6)));
  return false;
}
export async function prepareHonoPetPhoto(file:File):Promise<File>{
  if(!format[file.type]||!file.size||file.size>maxBytes)
    throw Error("PET_IMAGE_INVALID_FILE");
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.byteLength!==file.size||!bytesMatch(file.type,bytes))
    throw Error("PET_IMAGE_INVALID_BYTES");
  // Core derives the physical key extension from this server-created name.
  // A supplied .SVG, uppercase extension or path cannot escape the pet prefix.
  return new File([bytes],"pet-photo."+format[file.type],{type:file.type});
}
