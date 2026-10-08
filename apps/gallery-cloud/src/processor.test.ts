import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { createGalleryImageProcessor, GALLERY_IMAGE_MAX_OUTPUT_BYTES } from '@gafus/core/services/gallery/imageProcessing';
import { sharpGalleryEngine } from './sharp-engine';
const processImage=createGalleryImageProcessor(sharpGalleryEngine);
describe('real sharp implementation',()=>{
 it.each(['png','jpeg','webp'] as const)('decodes %s, preserves small dimensions and strips metadata',async format=>{
   const source=await sharp({create:{width:321,height:123,channels:3,background:'#123456'}})[format]().toBuffer();
   const out=await processImage(source);
   for (const variant of [out.thumb,out.full]) { const m=await sharp(variant.bytes).metadata(); expect(m).toMatchObject({format:'webp',width:321,height:123}); expect(m.exif).toBeUndefined(); expect(m.icc).toBeUndefined(); expect(m.xmp).toBeUndefined(); }
 });
 it('auto-orients EXIF including GPS before resizing, then removes all metadata',async()=>{
   const source=await sharp({create:{width:2400,height:1200,channels:3,background:'#7194aa'}}).withMetadata({orientation:6}).withExifMerge({IFD0:{Artist:'private'},IFD3:{GPSLatitudeRef:'N',GPSLatitude:'55/1 1/1 1/1',GPSLongitudeRef:'E',GPSLongitude:'37/1 1/1 1/1'}}).jpeg().toBuffer();
   expect((await sharp(source).metadata()).exif).toBeDefined();
   const out=await processImage(source); expect(out.thumb).toMatchObject({width:240,height:480}); expect(out.full).toMatchObject({width:960,height:1920});
   for(const v of [out.thumb,out.full]) { const m=await sharp(v.bytes).metadata(); expect(m.exif).toBeUndefined(); expect(m.orientation).toBeUndefined(); expect(m.icc).toBeUndefined(); }
 });
 it.each([Buffer.alloc(0),Buffer.alloc(10*1024*1024+1)])('rejects byte limits before decoding',async bytes=>await expect(processImage(bytes)).rejects.toMatchObject({code:'IMAGE_SIZE'}));
 it('rejects corrupt bytes and unsupported format',async()=>{
   await expect(processImage(Buffer.from('corrupt image'))).rejects.toMatchObject({code:'INVALID_IMAGE'});
   const tiff=await sharp({create:{width:10,height:10,channels:3,background:'red'}}).tiff().toBuffer(); await expect(processImage(tiff)).rejects.toMatchObject({code:'IMAGE_FORMAT'});
 });
 it('rejects >50MP at the native decoder',async()=>{
   const png=await sharp({create:{width:7100,height:7100,channels:3,background:'white'}}).png().toBuffer();
   await expect(processImage(png)).rejects.toMatchObject({code:'INVALID_IMAGE'});
 },20000);
 it('adapts high entropy alpha at fixed q82 to fit gateway/base64 response limits',async()=>{
   const source=await sharp(randomBytes(1920*1920*4),{raw:{width:1920,height:1920,channels:4}}).webp({quality:95}).toBuffer();
   expect(source.length).toBeLessThan(10*1024*1024);
   const initial=await sharpGalleryEngine.autoOrientResizeEncodeWebp(source,{autoOrient:true,maxEdge:1920,withoutEnlargement:true,quality:82,stripMetadata:true,limitInputPixels:50000000});
   expect(initial.bytes.length).toBeGreaterThan(GALLERY_IMAGE_MAX_OUTPUT_BYTES);
   const out=await processImage(source); expect(out.full.width).toBeLessThan(1920); expect(out.full.bytes.length).toBeLessThanOrEqual(GALLERY_IMAGE_MAX_OUTPUT_BYTES); expect(Buffer.from(out.full.bytes).toString('base64').length).toBeLessThan(2500000);
 },20000);
});
