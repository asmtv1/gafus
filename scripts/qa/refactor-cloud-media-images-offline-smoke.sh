#!/usr/bin/env bash
# All four Cloud.ru media image roles, local only: immutable test tags, no cloud/DB.
set -euo pipefail
[[ "$PWD" == "/Users/asmtv1/Desktop/gafus-refactor" ]] || exit 2
tag=20261029
for media in feed gallery; do
  for role in worker origin; do
    image="gafus-refactor-local-$media-$role-sharp:$tag"
    arch=$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}' 2>/dev/null || true)
    [[ "$arch" == linux/amd64 ]] || { echo "MEDIA_IMAGE_ARCH_FAIL $media $role"; exit 3; }
    if [[ "$role" == origin ]]; then
      docker run --rm --network none --entrypoint node "$image" --check origin.mjs >/dev/null 2>&1 ||
        { echo "MEDIA_ORIGIN_SYNTAX_FAIL $media"; exit 4; }
    elif [[ "$media" == feed ]]; then
      docker run --rm --network none --entrypoint node "$image" --check server.mjs >/dev/null 2>&1 ||
        { echo "FEED_IMAGE_SYNTAX_FAIL"; exit 4; }
      docker run --rm --network none --entrypoint ffmpeg "$image" -version >/dev/null 2>&1 ||
        { echo "FEED_FFMPEG_MISSING"; exit 4; }
      docker run --rm --network none --entrypoint node "$image" -e '
const sharp=require("sharp");
if(sharp.versions.sharp!=="0.35.5")process.exit(2);
sharp({create:{width:24,height:24,channels:3,background:{r:18,g:40,b:60}}})
.webp({quality:70}).toBuffer().then(async out=>{
const meta=await sharp(out).metadata();
if(meta.format!=="webp" || meta.width!==24)process.exit(3);
}).catch(()=>process.exit(4));
' >/dev/null 2>&1 || { echo "FEED_SHARP_RUNTIME_FAIL"; exit 4; }
    else
      docker run --rm --network none --entrypoint node "$image" --check job.mjs >/dev/null 2>&1 ||
        { echo "GALLERY_IMAGE_SYNTAX_FAIL"; exit 4; }
      docker run --rm --network none --entrypoint node "$image" -e '
const sharp=require("sharp");
if(sharp.versions.sharp!=="0.35.5")process.exit(2);
sharp({create:{width:24,height:24,channels:3,background:{r:60,g:40,b:20}}})
.avif({quality:70}).toBuffer().then(async out=>{
const meta=await sharp(out).metadata();
if(meta.format!=="heif" || meta.width!==24)process.exit(3);
}).catch(()=>process.exit(4));
' >/dev/null 2>&1 || { echo "GALLERY_SHARP_RUNTIME_FAIL"; exit 4; }
    fi
    echo "MEDIA_IMAGE_OFFLINE_PASS $media $role linux/amd64"
  done
done
echo "ALL_FOUR_CLOUD_MEDIA_IMAGE_ROLES_PASS"
