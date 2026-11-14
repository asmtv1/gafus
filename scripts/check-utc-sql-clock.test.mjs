import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {auditUtcSqlClock} from './check-utc-sql-clock.mjs';
function fixture(filename,contents){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-utc-sql-'));
 try{
  const target=path.join(temp,'packages','isolated','src',filename);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,contents);
  return auditUtcSqlClock(temp).findings;
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
test('rejects timestamp-without-zone comparison against implicit session timezone',()=>{
 const result=fixture('unsafe.ts','export const q = `SELECT * FROM receipts WHERE "expiresAt" <= CURRENT_TIMESTAMP`;');
 assert.equal(result.length,1);assert.match(result[0],/SQL_TIMESTAMP_TIMEZONE_IMPLICIT/);
});
test('rejects implicit timezone in string-concatenated UPDATE',()=>{
 const result=fixture('unsafe.ts',"export const q = 'SET \"committedAt\" = CURRENT_TIMESTAMP' + ' WHERE id=$1';");
 assert.equal(result.length,1);
});
test('accepts explicit UTC clocks, including SQL built with escaped string literals',()=>{
 const result=fixture('safe.ts',[
  "export const q = `SELECT * FROM receipts WHERE \"expiresAt\" <= timezone('UTC', CURRENT_TIMESTAMP)`;",
  "export const c = 'SET \"committedAt\"=timezone(\\'UTC\\', CURRENT_TIMESTAMP)';",
 ].join('\n'));
 assert.deepEqual(result,[]);
});
test('ignores comments and unit-test fixtures',()=>{
 assert.deepEqual(fixture('comments.ts',["// CURRENT_TIMESTAMP must be timezone normalized", "/** Never compare CURRENT_TIMESTAMP against Prisma DateTime directly. */", "export const x = 'unrelated';"].join('\n')),[]);
 assert.deepEqual(fixture('comments.test.ts',"const sql = 'CURRENT_TIMESTAMP';"),[]);
});
