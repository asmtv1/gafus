-- Run against the isolated restored DB, not the live source database.
-- One JSON document; no user PII, private keys or signed access URLs.
WITH public_locations AS (
  SELECT "avatarUrl" AS locator FROM "UserProfile"
  UNION ALL SELECT "photoUrl" FROM "Pet"
  UNION ALL SELECT unnest(ARRAY["logoImg","videoUrl"]) FROM "Course"
  UNION ALL SELECT unnest("imageUrls" || "pdfUrls" || "videoUrls" || ARRAY["videoUrl"]) FROM "Step"
  UNION ALL SELECT unnest("imageUrls" || "pdfUrls" || ARRAY["videoUrl"]) FROM "StepTemplate"
  UNION ALL SELECT unnest("imageUrls" || ARRAY["logoImg","videoUrl"]) FROM "Article"
  UNION ALL SELECT url FROM "PetDocument"
  UNION ALL SELECT url FROM "QuestionPhoto"
), public_refs AS (
  SELECT CASE
    WHEN locator LIKE 'https://storage.yandexcloud.net/gafus-media/%' THEN substr(locator,length('https://storage.yandexcloud.net/gafus-media/')+1)
    WHEN locator LIKE 'https://gafus-media.storage.yandexcloud.net/%' THEN substr(locator,length('https://gafus-media.storage.yandexcloud.net/')+1)
    WHEN locator LIKE 'https://cdn.gafus.ru/uploads/%' THEN substr(locator,length('https://cdn.gafus.ru/')+1)
    WHEN locator LIKE 'https://gafus.ru/uploads/%' THEN substr(locator,length('https://gafus.ru/')+1)
    WHEN locator LIKE 'https://www.gafus.ru/uploads/%' THEN substr(locator,length('https://www.gafus.ru/')+1)
    WHEN ltrim(locator,'/') LIKE 'uploads/%' THEN ltrim(locator,'/')
    END AS key
  FROM public_locations
), refs AS (
  SELECT 'public' AS scope,key FROM public_refs
  UNION ALL
  SELECT 'feed' AS scope, unnest(ARRAY["smallKey","thumbKey","fullKey","posterKey"] || "mp4Keys") AS key
  FROM "FeedMediaAsset" WHERE status::text = 'ready'
  UNION ALL
  SELECT 'gallery', unnest(ARRAY["thumbKey","fullKey"]) FROM "GalleryPhoto"
  WHERE "deletedAt" IS NULL AND status::text = 'ready'
  UNION ALL
  SELECT 'chat2', "objectKey" FROM "Chat2Media" WHERE status = 'READY'
  UNION ALL
  SELECT 'gallery', unnest(ARRAY["originalKey","previewKey"]) FROM "PetVetAttachment"
  UNION ALL
  SELECT 'documents', substr(url,length('cloudru:documents:')+1)
  FROM "PetDocument" WHERE url LIKE 'cloudru:documents:%'
  UNION ALL
  SELECT 'questions', substr(url,length('cloudru:questions:')+1)
  FROM "QuestionPhoto" WHERE url LIKE 'cloudru:questions:%'
  UNION ALL
  SELECT 'questions-v2', substr(url,length('questions-v2:')+1)
  FROM "QuestionPhoto" WHERE url LIKE 'questions-v2:%'
  UNION ALL
  SELECT 'questions-v2', unnest(ARRAY[manifest#>>'{variants,small,key}',manifest#>>'{variants,medium,key}'])
  FROM "QuestionV2MediaTask" WHERE status='READY' AND manifest IS NOT NULL
  UNION ALL
  SELECT 'chat2', unnest(ARRAY[manifest#>>'{keys,small}',manifest#>>'{keys,medium}',manifest->>'posterKey'])
  FROM "Chat2V2MediaTask" WHERE status='READY' AND manifest IS NOT NULL
  UNION ALL
  SELECT 'chat2', rendition->>'key' FROM "Chat2V2MediaTask" t
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.manifest->'renditions')='array'
    THEN t.manifest->'renditions' ELSE '[]'::jsonb END) rendition WHERE t.status='READY'
  UNION ALL
  SELECT 'public', CASE WHEN ltrim(v,'/') LIKE 'uploads/%' THEN ltrim(v,'/') ELSE 'uploads/'||ltrim(v,'/') END
  FROM "TrainerVideo" CROSS JOIN LATERAL unnest(ARRAY["relativePath","hlsManifestPath","thumbnailPath"]) v
  WHERE v IS NOT NULL AND v <> '' AND v NOT LIKE '%://%'
), chosen AS (
  SELECT DISTINCT r.id
  FROM "MobileOtaRelease" r
  WHERE r.state = 'READY'
     OR EXISTS (SELECT 1 FROM "MobileOtaDeployment" d
       WHERE r.id = d."activeReleaseId" OR r.id = d."previousReleaseId")
     OR EXISTS (SELECT 1 FROM "MobileOtaPublication" p WHERE r.id = ANY(p."releaseIds"))
), releases AS (
  SELECT r.id, r."nativeReleaseId", r."updateId", r.revision, r."sourceSha",
    r.platform, r.environment, r.channel, r."runtimeVersion", r."signingKeyId", r.state,
    encode(r."manifestBody",'hex') AS "manifestHex", r."signatureHeader",
    n."certificatePem", n."certificateSha256", n."nativeFingerprint", n.verified AS "nativeVerified",
    n.platform AS "nativePlatform", n.environment AS "nativeEnvironment",
    n.channel AS "nativeChannel", n."runtimeVersion" AS "nativeRuntimeVersion",
    n."signingKeyId" AS "nativeSigningKeyId",
    EXISTS (SELECT 1 FROM "MobileOtaDeployment" d WHERE d."previousReleaseId" = r.id) AS previous,
    EXISTS (SELECT 1 FROM "MobileOtaDeployment" d WHERE d."activeReleaseId" = r.id) AS active,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'assetKey',a."assetKey",'url',a."immutableUrl",'sha256',a.sha256,
      'mimeType',a."mimeType",'sizeBytes',a."sizeBytes"::text,'verified',a.verified
    ) ORDER BY a."assetKey") FROM "MobileOtaArtifact" a WHERE a."releaseId" = r.id), '[]'::jsonb) AS artifacts
  FROM chosen c JOIN "MobileOtaRelease" r ON r.id = c.id
  JOIN "MobileNativeRelease" n ON n.id = r."nativeReleaseId"
)
SELECT jsonb_build_object(
  'media', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.scope,m.key)
    FROM (SELECT DISTINCT scope,key FROM refs WHERE key IS NOT NULL AND key <> '') m), '[]'::jsonb),
  'ota', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM releases r), '[]'::jsonb),
  'unmapped', jsonb_build_object(
    'petDocuments', (SELECT count(*) FROM "PetDocument" WHERE url NOT LIKE 'cloudru:documents:%' AND url NOT LIKE 'https://storage.yandexcloud.net/gafus-media/%' AND url NOT LIKE 'https://gafus-media.storage.yandexcloud.net/%' AND url NOT LIKE 'https://cdn.gafus.ru/uploads/%' AND url NOT LIKE 'https://gafus.ru/uploads/%' AND url NOT LIKE 'https://www.gafus.ru/uploads/%' AND ltrim(url,'/') NOT LIKE 'uploads/%'),
    'questionPhotos', (SELECT count(*) FROM "QuestionPhoto" WHERE url <> '' AND url NOT LIKE 'cloudru:questions:%' AND url NOT LIKE 'questions-v2:%' AND url NOT LIKE 'https://storage.yandexcloud.net/gafus-media/%' AND url NOT LIKE 'https://gafus-media.storage.yandexcloud.net/%' AND url NOT LIKE 'https://cdn.gafus.ru/uploads/%' AND url NOT LIKE 'https://gafus.ru/uploads/%' AND url NOT LIKE 'https://www.gafus.ru/uploads/%' AND ltrim(url,'/') NOT LIKE 'uploads/%'),
    'chat2V2ReadyMissingManifest', (SELECT count(*) FROM "Chat2V2MediaTask" WHERE status='READY' AND (manifest IS NULL OR (manifest->>'kind'='image' AND (manifest#>>'{keys,small}' IS NULL OR manifest#>>'{keys,medium}' IS NULL)) OR (manifest->>'kind'='video' AND (manifest->>'posterKey' IS NULL OR jsonb_typeof(manifest->'renditions') IS DISTINCT FROM 'array' OR manifest->'renditions'='[]'::jsonb)) OR COALESCE(manifest->>'kind','') NOT IN ('image','video'))),
    'questionV2ReadyMissingManifest', (SELECT count(*) FROM "QuestionV2MediaTask" WHERE status='READY' AND (manifest IS NULL OR manifest#>>'{variants,small,key}' IS NULL OR manifest#>>'{variants,medium,key}' IS NULL))
  )
);
