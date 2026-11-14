#!/usr/bin/env node
/** Read-only baseline compatibility: compare HEAD Prisma models to current and local QA DB. */
import fs from "node:fs";
import path from "node:path";
import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function models(schema){
  const out=new Map();
  for(const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const name=m[1],body=m[2];
    const table=body.match(/@@map\("([^"]+)"\)/)?.[1]??name;
    const fields=new Map();
    for(const line of body.split("\n")) {
      const parsed=/^\s{2}(\w+)\s+([A-Za-z_][A-Za-z0-9_]*(?:\[\]|\?)?)(.*)$/.exec(line);
      if(!parsed || parsed[3].includes("@ignore"))continue;
      const sqlColumn=parsed[3].match(/@map\("([^"]+)"\)/)?.[1]??parsed[1];
      fields.set(parsed[1],{type:parsed[2],column:sqlColumn,attributes:parsed[3]});
    }
    out.set(name,{table,fields});
  }
  return out;
}
function enums(schema){
  const result=new Map();
  for(const match of schema.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const values=match[2].split("\n").map(x=>x.trim().split(/\s+/)[0])
      .filter(x=>x && !x.startsWith("//") && !x.startsWith("@@"));
    result.set(match[1],new Set(values));
  }
  return result;
}
function run(){
  const baseline=execFileSync("git",["show","HEAD:packages/prisma/schema.prisma"],{cwd:root,encoding:"utf8"});
  const current=fs.readFileSync(path.join(root,"packages/prisma/schema.prisma"),"utf8");
  const before=models(baseline),after=models(current);
  const missing=[];
  const oldEnums=enums(baseline),newEnums=enums(current);
  for(const [name,values] of oldEnums){
    const newValues=newEnums.get(name);
    if(!newValues)missing.push(`enum:${name}`);
    else for(const value of values)if(!newValues.has(value))missing.push(`enum:${name}.${value}`);
  }
  let newOptionalFields=0;
  for(const [name,old] of before) {
    const fresh=after.get(name);
    if(!fresh){missing.push(`model:${name}`);continue;}
    if(fresh.table!==old.table)missing.push(`table map:${name}`);
    for(const [field,oldField] of old.fields){
      const now=fresh.fields.get(field);
      if(!now || oldField.type!==now.type || oldField.column!==now.column)
        missing.push(`field:${name}.${field}`);
    }
    for(const [field,value] of fresh.fields){
      if(old.fields.has(field))continue;
      const type=value.type.replace(/[?\[\]]/g,"");
      // New relations carry no independent SQL column; new scalars must be
      // nullable or have a default to preserve legacy INSERT semantics.
      if(after.has(type))continue;
      newOptionalFields++;
      if(!value.type.endsWith("?") && !value.type.endsWith("[]") &&
         !value.attributes.includes("@default"))
        missing.push(`mandatory-new-field:${name}.${field}`);
    }
  }
  if(missing.length)throw Error(`BASELINE_PRISMA_BREAKING_CHANGE: ${missing.slice(0,20).join(",")}`);
  let columnsVerified=0;
  if(process.env.GAFUS_OTA_COMPAT_DB_URL) {
    const url=new URL(process.env.GAFUS_OTA_COMPAT_DB_URL);
    if(url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" || url.port!=="55673" ||
       !["/gafus_ota_snapshot_20261112","/gafus_ota_legacy_20261113"].includes(url.pathname)) throw Error("ONLY_LOCAL_SNAPSHOT_ALLOWED");
    const command=spawnSync("psql",["-h",url.hostname,"-p",url.port,"-U",decodeURIComponent(url.username),
      "-d",url.pathname.slice(1),"-At","-F","|","-c",
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,column_name"],
      {encoding:"utf8",timeout:20000});
    if(command.status!==0)throw Error(`PSQL_INTROSPECTION_FAILED: ${(command.stderr??"").slice(0,320)}`);
    const actual=new Set(command.stdout.split("\n").filter(Boolean));
    const objects=new Set([...before.keys()]);
    const modelsMissing=[];
    for(const [,data] of before){
      for(const [,field] of data.fields){
        const baseType=field.type.replace(/[?\[\]]/g,"");
        if(objects.has(baseType))continue; // Prisma relation, no SQL column.
        const fullname=`${data.table}|${field.column}`;
        if(!actual.has(fullname))modelsMissing.push(fullname);
        else columnsVerified++;
      }
    }
    if(modelsMissing.length)throw Error(`BASELINE_SQL_COLUMN_MISSING: ${modelsMissing.slice(0,20).join(",")}`);
  }
  console.log(JSON.stringify({status:"BACKWARD_SCHEMA_SHAPE_PASS",baselineModels:before.size,
    currentModels:after.size,addedModels:after.size-before.size,
    removedOrChangedFields:0,newOptionalFields,oldEnumsVerified:oldEnums.size,
    oldPhysicalColumnsVerified:columnsVerified,
    note:"Read-only structural compatibility, not an older API/Worker runtime start test"}));
}
try{run();}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
