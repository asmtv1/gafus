/** Browser-only photo transcoding. S3 receives final WebP files, never an original.
 * Canvas redraw removes EXIF / geo metadata, preserves aspect ratio and does
 * not upscale small images. No server-side image-encoding Jobs are involved.
 */
export type BrowserWebpVariant={file:File;width:number;height:number};
export type BrowserWebpSizes=Record<string,number>;
const MAX_IMAGE_PIXELS=50_000_000;
const MAX_VARIANT_BYTES=1_750_000;
const WEBP_QUALITY=0.8;

async function encode(canvas:HTMLCanvasElement,filename:string):Promise<File>{
  const blob=await new Promise<Blob>((resolve,reject)=>{
    canvas.toBlob(output=>output?resolve(output):reject(Error("Не удалось сжать фотографию")),
      "image/webp",WEBP_QUALITY);
  });
  if(blob.type!=="image/webp")throw Error("Этот браузер не поддерживает WebP. Обновите браузер.");
  return new File([blob],filename,{type:"image/webp"});
}

export async function prepareBrowserPhotoWebp<T extends BrowserWebpSizes>(
  source:File,edges:T,signal?:AbortSignal,
):Promise<{[K in keyof T]:BrowserWebpVariant}>{
  if(!["image/jpeg","image/png","image/webp","image/heic","image/heif"].includes(source.type)||
     !source.size||source.size>50*1024*1024)
    throw Error("Выберите фотографию JPG, PNG, WebP или HEIC до 50 МиБ");
  if(typeof createImageBitmap!=="function")
    throw Error("Браузер не поддерживает обработку фотографий. Обновите браузер.");
  if(signal?.aborted)throw Error("Загрузка фотографии отменена");
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(source,{imageOrientation:"from-image"});}
  catch{throw Error("Не удалось прочитать фотографию в браузере");}
  try{
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>MAX_IMAGE_PIXELS)
      throw Error("Фотография превышает допустимое разрешение (50 Мп)");
    const out={} as {[K in keyof T]:BrowserWebpVariant};
    for(const [name,edge] of Object.entries(edges)){
      if(signal?.aborted)throw Error("Загрузка фотографии отменена");
      if(!Number.isSafeInteger(edge)||edge<1||edge>1920)
        throw Error("Недопустимый размер варианта фотографии");
      let scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
      let file:File|undefined;
      let width=0,height=0;
      for(let tries=0;tries<6;tries++){
        width=Math.max(1,Math.round(bitmap.width*scale));
        height=Math.max(1,Math.round(bitmap.height*scale));
        const canvas=document.createElement("canvas");
        canvas.width=width;canvas.height=height;
        try{
          const context=canvas.getContext("2d",{alpha:false});
          if(!context)throw Error("Браузер не смог обработать фотографию");
          context.drawImage(bitmap,0,0,width,height);
          file=await encode(canvas,`${name}.webp`);
        }finally{canvas.width=0;canvas.height=0;}
        if(file.size<=MAX_VARIANT_BYTES)break;
        if(Math.max(width,height)<=320)throw Error("Не удалось уменьшить фотографию до размера загрузки");
        scale*=0.8;
      }
      if(!file||!file.size||file.size>MAX_VARIANT_BYTES)
        throw Error("Не удалось подготовить фотографию для отправки");
      out[name as keyof T]={file,width,height};
    }
    if(signal?.aborted)throw Error("Загрузка фотографии отменена");
    return out;
  }finally{bitmap.close();}
}
