#!/usr/bin/env node
/** A DateTime Prisma column is generally PostgreSQL timestamp without time zone.
 * Comparing/updating it with the implicit timezone conversion of
 * CURRENT_TIMESTAMP (timestamptz) can expire active records hours early.
 * Require explicit UTC timestamp at every SQL string use, across package/app code.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const defaultRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const jsStrings=new Set([
 ts.SyntaxKind.StringLiteral,
 ts.SyntaxKind.NoSubstitutionTemplateLiteral,
 ts.SyntaxKind.TemplateHead,
 ts.SyntaxKind.TemplateMiddle,
 ts.SyntaxKind.TemplateTail,
]);
const utcClock=/timezone\(\s*['"]UTC['"]\s*,\s*CURRENT_TIMESTAMP\s*\)/gi;
function isSourceFile(name){
 return /\.[cm]?[jt]sx?$/.test(name) && !/\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(name);
}
function* walk(directory){
 if(!fs.existsSync(directory))return;
 for(const e of fs.readdirSync(directory,{withFileTypes:true})){
  if(e.isDirectory()){
   if(['node_modules','dist','.turbo','.next','build','coverage','__tests__','generated'].includes(e.name))continue;
   yield* walk(path.join(directory,e.name));
  } else if(e.isFile() && isSourceFile(e.name))yield path.join(directory,e.name);
 }
}
export function auditUtcSqlClock(root=defaultRoot){
 const findings=[];
 let checked=0;
 for(const base of ['packages','apps']) for(const name of walk(path.join(root,base))){
  checked++;
  const source=fs.readFileSync(name,'utf8');
  if(!source.includes('CURRENT_TIMESTAMP'))continue;
  const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,source);
  let token;
  while((token=scanner.scan())!==ts.SyntaxKind.EndOfFileToken){
   if(!jsStrings.has(token))continue;
   const raw=scanner.getTokenText();
   const unescaped=raw.replace(/\\['"]/g,character=>character[1]);
   const bare=unescaped.replace(utcClock,'');
   if(!/\bCURRENT_TIMESTAMP\b/.test(bare))continue;
   const offset=scanner.getTokenPos();
   const line=source.slice(0,offset).split('\n').length;
   findings.push(`${path.relative(root,name)}:${line}: SQL_TIMESTAMP_TIMEZONE_IMPLICIT`);
  }
 }
 return {findings,checked};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const rootFlag=process.argv.indexOf('--project-root');
 const projectRoot=rootFlag>=0?path.resolve(process.argv[rootFlag+1]??'.'):defaultRoot;
 const result=auditUtcSqlClock(projectRoot);
 if(result.findings.length){
  console.error('PostgreSQL UTC clock boundary FAIL:\n'+result.findings.join('\n'));
  process.exitCode=1;
 }else console.log(`PostgreSQL UTC clock boundary PASS: ${result.checked} modules; no naive CURRENT_TIMESTAMP SQL strings`);
}
