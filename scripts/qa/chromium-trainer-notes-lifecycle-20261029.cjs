"use strict";
const fs=require("fs"),cp=require("child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const accounts=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const trainer=accounts.find(x=>x.role==="TRAINER");
const student=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-trainer-notes-cuid-student-20261029.json","utf8"));
if(!trainer||!student?.id||!/^c[a-z0-9]{24}$/.test(student.id)||student.username!=="qa_trainer_notes_cuid_student_20261029"||trainer.id===student.id)throw Error("REFUSE_NON_QA_CUID_STUDENT");
const portPid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const processText=cp.execFileSync("ps",["eww","-p",portPid,"-o","command="],{encoding:"utf8"}),raw=processText.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],url=new URL(raw);
if(url.hostname!=="127.0.0.1"||url.port!=="55921"||url.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_UNSAFE_PG");
const title="QA Trainer Notes CRUD 20261029",initialText="QA local note step 1, no personal details",editedText="QA local note step 1 edited, no personal details";
const passes=[];let currentId=null;
async function db(fn){const c=new Client({connectionString:raw});await c.connect();try{return await fn(c)}finally{await c.end()}}
async function own(){return db(c=>c.query('SELECT id,title,"trainerId",tags FROM "TrainerNote" WHERE "trainerId"=$1 AND title=$2',[trainer.id,title]))}
async function inspect(){return db(async c=>{
 const r=await ownId(c);
 if(!r)return null;
 const entries=await c.query('SELECT content, "isVisibleToStudent" FROM "TrainerNoteEntry" WHERE "noteId"=$1 ORDER BY "order"',[r.id]);
 const students=await c.query('SELECT "studentId" FROM "TrainerNoteStudent" WHERE "noteId"=$1',[r.id]);
 return {id:r.id,entries:entries.rows,students:students.rows,tags:r.tags};
})}
async function ownId(c){const x=await c.query('SELECT id,tags FROM "TrainerNote" WHERE "trainerId"=$1 AND title=$2',[trainer.id,title]);if(x.rowCount>1)throw Error("DUPLICATE_QA_NOTE");return x.rows[0]??null}
async function cleanup(){
 const r=await own();if(!r.rowCount){console.log("QA_TRAINER_NOTE_NONE_REMAIN");return}
 if(r.rowCount!==1||r.rows[0].trainerId!==trainer.id)throw Error("REFUSE_UNRELATED_NOTE");
 await db(async c=>{
 await c.query("BEGIN");try{
  const note=await c.query('SELECT id,title,"trainerId" FROM "TrainerNote" WHERE id=$1 FOR UPDATE',[r.rows[0].id]);
  if(note.rowCount!==1||note.rows[0].trainerId!==trainer.id||note.rows[0].title!==title)throw Error("REFUSE_NOTE_OWNER");
  const e=await c.query('SELECT content FROM "TrainerNoteEntry" WHERE "noteId"=$1',[r.rows[0].id]);
  const s=await c.query('SELECT "studentId" FROM "TrainerNoteStudent" WHERE "noteId"=$1',[r.rows[0].id]);
  if(e.rows.some(x=>![initialText,editedText].includes(x.content))||s.rows.some(x=>x.studentId!==student.id))throw Error("REFUSE_NOTE_WITH_UNRELATED_CONTENT");
  const deleted=await c.query('DELETE FROM "TrainerNote" WHERE id=$1 AND "trainerId"=$2 AND title=$3',[r.rows[0].id,trainer.id,title]);
  if(deleted.rowCount!==1)throw Error("QA_NOTE_DELETE_COUNT");
  await c.query("COMMIT");
 }catch(err){await c.query("ROLLBACK").catch(()=>{});throw err}
 });
 if((await own()).rowCount)throw Error("QA_NOTE_CLEANUP_NOT_EMPTY");
 console.log("QA_TRAINER_NOTE_ONLY_OWN_FIXTURE_CLEANED_SQL_ZERO");
}
async function session(b,vp){
 const context=await b.newContext({viewport:vp==="mobile"?{width:390,height:844}:{width:1280,height:800}});
 await context.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await context.newPage(),events=[];
 page.on("response",r=>{const u=new URL(r.url()).pathname;if(u.startsWith("/api/v1/trainer/notes/manage")&&r.request().method()!=="GET")events.push({method:r.request().method(),status:r.status()})});
 await page.goto("http://127.0.0.1:5173/main-panel",{waitUntil:"domcontentloaded"});
 await page.getByRole("heading",{name:"Вход в панель тренера"}).waitFor({timeout:15000});
 await page.getByRole("textbox",{name:"Логин"}).fill(trainer.username);
 await page.getByRole("textbox",{name:"Пароль"}).fill(trainer.password);
 await page.getByRole("button",{name:"Войти",exact:true}).click();
 const nav=page.getByRole("navigation",{name:"Разделы панели тренера"});await nav.waitFor({timeout:14000});
 await nav.getByRole("link",{name:"Заметки",exact:true}).click();
 await page.getByRole("heading",{name:"Заметки тренера"}).waitFor({timeout:13000});
 await page.getByRole("heading",{name:"Новая заметка"}).waitFor({timeout:12000});
 return {page,context,events};
}
async function ack(p,method,run,expectStatus){
 const pending=p.waitForResponse(r=>r.request().method()===method&&new URL(r.url()).pathname.startsWith("/api/v1/trainer/notes/manage"),{timeout:12500});
 await run();const response=await pending;
 if(response.status()!==expectStatus)throw Error("TRAINER_NOTE_HTTP_MISMATCH_"+method+"_"+response.status());
 return response;
}
(async()=>{
 if((await own()).rowCount)throw Error("REFUSE_PREEXISTING_NOTE_TITLE");
 const studentDB=await db(c=>c.query('SELECT id,username,role,email,phone FROM "User" WHERE id=$1',[student.id]));
 if(studentDB.rowCount!==1||studentDB.rows[0].username!==student.username||studentDB.rows[0].role!=="USER"||studentDB.rows[0].email!==null||studentDB.rows[0].phone!==null)throw Error("REFUSE_NOT_OWN_TEMP_QA_STUDENT");
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const first=await session(b,"desktop");
 try{
  const p=first.page;
  const form=p.locator("form").filter({has:p.getByRole("button",{name:"Создать заметку"})});
  await form.getByRole("textbox",{name:"Заголовок"}).fill(title);
  await form.getByRole("textbox",{name:"ID учеников (через запятую)"}).fill(student.id);
  await form.getByRole("textbox",{name:"Метки (через запятую)"}).fill("qa, local");
  await form.getByRole("textbox",{name:"Запись 1"}).fill(initialText);
  await form.getByRole("checkbox",{name:"Показывать ученику"}).check();
  await ack(p,"POST",()=>form.getByRole("button",{name:"Создать заметку"}).click(),201);
  const data=await inspect();
  if(!data||data.entries.length!==1||data.entries[0].content!==initialText||!data.entries[0].isVisibleToStudent||data.students.length!==1||data.students[0].studentId!==student.id)throw Error("QA_NOTES_CREATE_SQL_CHECK_FAILED");
  currentId=data.id;
  passes.push({viewport:"desktop",action:"create note for synthetic QA student",http201:true,sqlStudentAndEntry:true,pass:true});
  console.log("QA_TRAINER_NOTES_STEP_PASS",JSON.stringify(passes.at(-1)));
 }finally{await first.context.close()}
 const second=await session(b,"mobile");
 try{
  const p=second.page;
  const item=p.locator("section[aria-label='Список заметок'] li").filter({has:p.locator("strong",{hasText:title})}).first();
  await item.waitFor({timeout:14000});
  await item.getByRole("button",{name:"Редактировать"}).click();
  await p.getByRole("heading",{name:"Редактировать заметку"}).waitFor({timeout:10000});
  const form=p.locator("form").filter({has:p.getByRole("button",{name:"Сохранить изменения"})});
  if(await form.getByRole("textbox",{name:"Запись 1"}).inputValue()!==initialText)throw Error("QA_NOTE_MOBILE_READBACK_MISMATCH");
  await form.getByRole("textbox",{name:"Запись 1"}).fill(editedText);
  await ack(p,"PUT",()=>form.getByRole("button",{name:"Сохранить изменения"}).click(),200);
  const edited=await inspect();if(!edited||edited.entries[0]?.content!==editedText||edited.students[0]?.studentId!==student.id)throw Error("QA_NOTE_EDIT_SQL_MISMATCH");
  passes.push({viewport:"mobile",action:"read/update note",http200:true,sqlEdited:true,pass:true});
  console.log("QA_TRAINER_NOTES_STEP_PASS",JSON.stringify(passes.at(-1)));
  const again=p.locator("section[aria-label='Список заметок'] li").filter({has:p.locator("strong",{hasText:title})}).first();
  await again.waitFor({timeout:12000});
  p.once("dialog",d=>d.accept());
  await ack(p,"DELETE",()=>again.getByRole("button",{name:"Удалить"}).click(),200);
  if((await own()).rowCount)throw Error("QA_NOTE_DELETE_SQL_STILL_EXISTS");
  passes.push({viewport:"mobile",action:"delete own synthetic note",http200:true,sqlZero:true,pass:true});
  console.log("QA_TRAINER_NOTES_STEP_PASS",JSON.stringify(passes.at(-1)));
 }finally{await second.context.close()}
 }finally{await b.close()}
})().catch(e=>{console.log("QA_TRAINER_NOTES_E2E_ERROR",String(e.message).slice(0,230));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("QA_TRAINER_NOTES_CLEANUP_ERROR",String(e.message).slice(0,220));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/trainer-notes-e2e.json",JSON.stringify({passes},null,2));
});
