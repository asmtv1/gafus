import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { sharpGalleryEngine, createGalleryImageProcessor } = require('../dist/local/processor.cjs');
const processImage = createGalleryImageProcessor(sharpGalleryEngine);
const bytes = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: '#386d96' } }).jpeg().toBuffer();
const start = performance.now(); const out = await processImage(bytes);
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), platform: process.platform, arch: process.arch, node: process.version, inputPixels: 24000000, inputBytes: bytes.length, elapsedMs: Math.round(performance.now()-start), maxRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1), thumbBytes: out.thumb.bytes.length, fullBytes: out.full.bytes.length, cloudMeasurement: false }, null, 2));
