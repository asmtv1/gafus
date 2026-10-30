"use strict";
const fs=require("node:fs"),cp=require("node:child_process");
const base="/Users/asmtv1/Desktop/gafus-refactor";
if(process.cwd()!==base)throw Error("REFUSE_UNSAFE_DIRECTORY");
const path=".local-pg-scratch/qa-browser-accounts-20261029.json";
const stat=fs.statSync(path);
if((stat.mode&0o077)!==0)throw Error("REFUSE_READABLE_QA_CREDENTIALS");
const actor=JSON.parse(fs.readFileSync(path,"utf8")).find(x=>x.role==="USER");
if(!actor?.username||!actor?.password)throw Error("NO_SYNTHETIC_QA_USER");
const quote=s=>'"'+String(s).replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\r|\n/g,"")+'"';
// Native controlled React TextInput can drop batched hardware keystrokes.
 // Send one character at a time and give React a rendering opportunity.
const slow=(value)=>Array.from(value).flatMap(ch=>[
 '  keystroke '+quote(ch),'  delay 0.13'
]);
const script=[
 'tell application "Simulator" to activate',
 'tell application "System Events"',
 '  tell process "Simulator" to click at {815,702}',
 '  delay 0.4',
 '  keystroke "a" using command down',
 '  key code 51',
 ...slow(actor.username),
 '  delay 0.4',
 '  tell process "Simulator" to click at {815,739}',
 '  delay 0.4',
 '  keystroke "a" using command down',
 '  key code 51',
 ...slow(actor.password),
 '  delay 0.3',
 'end tell'
].join("\n");
const proc=cp.spawnSync("/usr/bin/osascript",["-"],{
 input:script,encoding:"utf8",timeout:40000,stdio:["pipe","ignore","ignore"]
});
if(proc.status!==0)throw Error("OSASCRIPT_QA_INPUT_FAILED:"+String(proc.status));
console.log("IOS_QA_LOGIN_SYNTHETIC_FIELDS_TYPED_WITH_STDIN_NO_SECRET_LOG");
