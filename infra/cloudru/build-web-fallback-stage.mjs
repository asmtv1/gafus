import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const file=resolve(root,"infra/cloudru/staging-web-fallback-entry.tsx");
const output="/tmp/gafus-stage-fallback-real-web.js";
const alias={ "@/shared/components/media/CdnImage":resolve(root,"apps/web/src/shared/components/media/CdnImage.tsx"),
  "@/shared/lib/media/cdnProbe":resolve(root,"apps/web/src/shared/lib/media/cdnProbe.ts")};
const r=await build({entryPoints:[file],outfile:output,bundle:true,platform:"browser",nodePaths:[resolve(root,"apps/web/node_modules")],
 format:"iife",banner:{js:"var process={env:{NODE_ENV:'production'}};var global=globalThis;"},target:["chrome115"],jsx:"automatic",logLevel:"info",metafile:true,
 mainFields:["browser","module","main"],conditions:["browser","import","default"],
 plugins:[{name:"gafus-web-localstage",setup(s){
  s.onResolve({filter:/^@\/shared\//},args=>{
   if(!alias[args.path])throw Error("STAGE_ALIAS_NOT_ALLOWLISTED_"+args.path);
   return {path:alias[args.path]};});
  s.onResolve({filter:/\.module\.css$/},args=>({path:args.path,namespace:"css-stage-only"}));
  s.onLoad({filter:/.*/,namespace:"css-stage-only"},()=>({contents:"export default new Proxy({}, {get:(_t,key)=>String(key)})",loader:"js"}));
 }}]});
const files=Object.keys(r.metafile.inputs);
for(const needed of ["apps/web/src/shared/components/media/CdnImage.tsx","apps/web/src/features/feed/FeedVideo.tsx",
"apps/web/src/features/feed/api.ts","apps/web/src/shared/lib/media/cdnProbe.ts"]){
 if(!files.some(f=>f.endsWith(needed)))throw Error("ACTUAL_COMPONENT_NOT_COMPILED_"+needed);
}
console.log(JSON.stringify({bundle:output,sourceFiles:files.length,actualComponentsIncluded:true}));
