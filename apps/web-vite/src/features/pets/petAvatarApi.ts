import {ApiError} from "../../shared/api/client";
import {trustedPetPhotoUrl,sameTrustedPetPhotoObject} from "./petPhotoUrl";
import {getMyPet} from "./petApi";
const permitted=["image/jpeg","image/png","image/webp","image/gif"];
const maxBytes=2*1024*1024;
const maxCompressed=600*1024;
const identifier=(id:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(id)&&
  id!=="."&&id!=="..";
const sig=(b:Uint8Array,t:string)=>{
  if(t==="image/jpeg")return b[0]===255&&b[1]===216&&b[2]===255;
  if(t==="image/png")return b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71;
  if(t==="image/webp")return String.fromCharCode(...b.slice(0,4))==="RIFF"&&
    String.fromCharCode(...b.slice(8,12))==="WEBP";
  if(t==="image/gif")return String.fromCharCode(...b.slice(0,6))==="GIF87a"||
    String.fromCharCode(...b.slice(0,6))==="GIF89a";
  return false;
};
export async function preparedPetAvatar(file:File):Promise<File>{
  if(!permitted.includes(file.type)||!file.size||file.size>maxBytes||
    file.name.length>255||!file.name.trim())
    throw Error("Фотография должна быть JPG, PNG, WebP или GIF не больше 2 МБ.");
  const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
  if(!sig(b,file.type))throw Error("Повреждённое или неподдерживаемое изображение.");
  // Original Next resizes large images to ~800px and ~0.6MB. Native canvas
  // is used only for supported nonanimated formats; do not flatten GIF.
  if(file.type==="image/gif"||typeof createImageBitmap!=="function")return file;
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw Error("Не удалось прочитать изображение.");}
  try{
    const scale=Math.min(1,800/bitmap.width,800/bitmap.height);
    if(scale===1&&file.size<=maxCompressed)return file;
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext("2d");
    if(!context)throw Error("Не удалось уменьшить фотографию.");
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    let blob:Blob|null=null;
    for(const quality of [0.85,0.7,0.55,0.4]){
      blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
      if(blob&&blob.size<=maxCompressed)break;
    }
    if(!blob||!blob.size||blob.size>maxBytes)throw Error("Фотографию не удалось обработать.");
    return new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg"});
  }finally{bitmap.close();}
}
export async function uploadPetAvatarAndVerify(petId:string,file:File):Promise<string>{
  if(!identifier(petId))throw Error("Некорректный идентификатор питомца.");
  const ready=await preparedPetAvatar(file);
  const form=new FormData();form.append("file",ready);
  const response=await fetch("/api/v1/pets/"+petId+"/photo",{
    method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{Accept:"application/json","X-Gafus-Auth-Transport":"cookie"},body:form,
  });
  let envelope:unknown;
  try{envelope=await response.json();}catch{
    throw new ApiError(response.status,"Неизвестный ответ сохранения фото.");
  }
  if(!response.ok||!envelope||typeof envelope!=="object"||
    (envelope as {success?:unknown}).success!==true)
    throw new ApiError(response.status,"Не удалось загрузить фотографию.");
  const data=(envelope as {data?:unknown}).data;
  const url=data&&typeof data==="object"&&
    (data as {photoUrl?:unknown}).photoUrl;
  const safe=trustedPetPhotoUrl(url);
  if(response.status!==200||!safe)throw Error("PET_AVATAR_ACK_UNKNOWN");
  const ownerPet=await getMyPet(petId);
  // A signed local S3 GET is reissued with a fresh signature on each read.
  // Compare only the validated immutable object path, not transient credentials.
  if(!sameTrustedPetPhotoObject(ownerPet.photoUrl,safe))
    throw Error("PET_AVATAR_READBACK_UNKNOWN");
  return safe;
}
