#!/usr/bin/env python3
"""Isolated Refactor-only Chat2 HTTP E2E with a temporary local account.

No production endpoints; no tokens or credentials in logs. Removes only this
run's unique account and private room, including on API failure.
"""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid
from urllib.parse import urlparse, unquote
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT=Path('/Users/asmtv1/Desktop/gafus-refactor')
SCRATCH=ROOT/'.local-pg-scratch'
APP=SCRATCH/'production_snapshot_20261024/app.env'
KEY=SCRATCH/'hono-local-access.secret'
DB_ROOT=SCRATCH/'production_snapshot_20261024/data'
BASE='http://127.0.0.1:3003/api/v1/chats'

def require(ok,code):
    if not ok: raise RuntimeError(code)

def main():
    require(ROOT.resolve()==ROOT and not ROOT.is_symlink(),'WRONG_ROOT')
    require(subprocess.check_output(['git','-C',str(ROOT),'rev-parse','--show-toplevel'],text=True).strip()==str(ROOT),'WRONG_GIT_ROOT')
    require(subprocess.check_output(['git','-C',str(ROOT),'branch','--show-current'],text=True).strip()=='vite','WRONG_BRANCH')
    for p in (SCRATCH, APP, KEY, DB_ROOT):
        require(p.exists() and not p.is_symlink() and p.resolve().is_relative_to(ROOT),'UNSAFE_FILE')
    require((KEY.stat().st_mode&0o077)==0 and (APP.stat().st_mode&0o077)==0,'NONPRIVATE_FILE')
    require(('postgres -D '+str(DB_ROOT)+' ') in subprocess.check_output(['ps','ax','-o','command='],text=True),'WRONG_POSTGRES_PROCESS')
    raw=APP.read_text().strip()
    require(raw.startswith('DATABASE_URL=') and '\n' not in raw,'LOCAL_DB_CONFIG_INVALID')
    db=urlparse(raw.removeprefix('DATABASE_URL='))
    require((db.scheme,db.hostname,db.port,db.path,db.username)==('postgresql','127.0.0.1',55921,'/gafus_refactor_real_work_20261024','gafus_refactor_local_real'),'WRONG_DATABASE')
    env={**os.environ,'PGPASSWORD':unquote(db.password or '')}
    sqlbase=['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55921','-U',db.username,'-d',db.path[1:]]
    def sql(query):
        result=subprocess.run(sqlbase,input=query,text=True,env=env,capture_output=True,timeout=10)
        require(result.returncode==0,'LOCAL_SQL_OPERATION_REJECTED')
        return result.stdout.strip()
    # No existing users/conversations altered except by FK-bound temporary data.
    nonce=uuid.uuid4().hex
    actor='chat2_local_qa_'+nonce[:12]
    user_id=nonce
    room=None
    user_created=False
    uploaded_key=None
    signed_url=None
    try:
        result=sql(f'''INSERT INTO "User" ("id","username","password","updatedAt")
            VALUES ('{user_id}','{actor}','disabled-login-smoke',timezone('UTC',clock_timestamp()))
            RETURNING "id";''')
        require(result==user_id,'TEST_ACTOR_CREATE_FAILED')
        user_created=True
        now=int(time.time())
        header={'alg':'HS256','typ':'JWT'}
        payload={'iss':'https://api.gafus.ru','aud':'gafus-app','sub':user_id,
                 'username':actor,'role':'USER','authenticatedAt':now*1000,
                 'iat':now,'exp':now+300}
        def b64(v):return base64.urlsafe_b64encode(v).decode().rstrip('=')
        signing=b64(json.dumps(header,separators=(',',':')).encode())+'.'+b64(json.dumps(payload,separators=(',',':')).encode())
        signature=b64(hmac.new(KEY.read_bytes().strip(),signing.encode(),hashlib.sha256).digest())
        token=signing+'.'+signature
        def call(path,method='GET',data=None,raw=None,media_type=None):
            require(path.startswith('/') or path=='','BAD_HTTP_PATH')
            body=raw if raw is not None else None if data is None else json.dumps(data).encode()
            req=Request(BASE+path, data=body, method=method, headers={
                'Authorization':'Bearer '+token,
                **({'Content-Type':media_type or 'application/json'} if body is not None else {})})
            try:
                with urlopen(req, timeout=8) as response:
                    return response.status,json.load(response)
            except HTTPError as e:
                try: response=json.load(e)
                except Exception: response={}
                return e.code,response
        status, response=call('')
        require(status==200 and response.get('success') and isinstance(response.get('data'),list),'CHAT2_AUTH_LIST_FAIL')
        # Browser uses same-origin Vite with HttpOnly access cookie, NOT Bearer.
        # Ensure a malicious Origin cannot create a room and that the exact
        # Refactor Vite origin can create one through the live Vite proxy.
        def browser_group(origin):
            body=json.dumps({'name':'Temporary local Chat2 QA','description':'',
                'kind':'GROUP','visibility':'PRIVATE'}).encode()
            req=Request('http://127.0.0.1:5173/api/v1/chats/groups',data=body,method='POST',headers={
                'Cookie':'gafus_access='+token,
                'Origin':origin,
                'Content-Type':'application/json',
                'X-Gafus-Auth-Transport':'cookie',
            })
            try:
                with urlopen(req,timeout=8) as response:
                    return response.status,json.load(response)
            except HTTPError as error:
                return error.code,json.load(error)
        status, response=browser_group('https://evil.example')
        require(status==403,'CHAT2_FOREIGN_ORIGIN_UNEXPECTEDLY_ACCEPTED')
        status, response=browser_group('http://127.0.0.1:5173')
        room=response.get('data',{}).get('conversationId')
        require(status==201 and room and re.fullmatch('[A-Za-z0-9_-]{1,128}',room),'CHAT2_CREATE_ROOM_FAIL')
        # Real S3-compatible multipart upload, strictly to the isolated MinIO.
        image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==')
        boundary='chat2qa'+uuid.uuid4().hex
        upload=(b'--'+boundary.encode()+b'\r\n'
            +b'Content-Disposition: form-data; name="file"; filename="smoke.png"\r\n'
            +b'Content-Type: image/png\r\n\r\n'+image+b'\r\n'
            +b'--'+boundary.encode()+b'--\r\n')
        # Exercise the exact Web messenger path through Vite's Chat2 proxy,
        # with the same browser cookie and CSRF origin as a real file picker.
        upload_req=Request('http://127.0.0.1:5173/api/v1/chats/'+room+'/attachments',
            data=upload, method='POST', headers={
                'Cookie':'gafus_access='+token,
                'Origin':'http://127.0.0.1:5173',
                'X-Gafus-Auth-Transport':'cookie',
                'Accept':'application/json',
                'Content-Type':'multipart/form-data; boundary='+boundary,
            })
        try:
            with urlopen(upload_req,timeout=12) as uploaded:
                status,response=uploaded.status,json.load(uploaded)
        except HTTPError as error:
            status=error.code
            try:response=json.load(error)
            except Exception:response={}
        attachment=(response.get('data') or {}).get('id')
        require(status==201 and isinstance(attachment,str) and
                re.fullmatch('[A-Za-z0-9_-]{1,128}',attachment),'CHAT2_REAL_S3_UPLOAD_FAIL')
        uploaded_key=sql(f'''SELECT "objectKey" FROM "Chat2Media" WHERE "id"='{attachment}' AND "conversationId"='{room}' AND "ownerId"='{user_id}' LIMIT 1;''')
        require(uploaded_key.startswith('chat2/'+room+'/'+user_id+'/'),'CHAT2_S3_KEY_SCOPE_FAIL')
        message_id=uuid.uuid4().hex
        status, response=call('/'+room+'/messages','POST',{
            'clientMessageId':str(uuid.uuid4()),'text':'Temporary Chat2 local E2E test',
            'attachmentIds':[attachment]})
        msg=response.get('data',{})
        require(status==201 and msg.get('text')=='Temporary Chat2 local E2E test','CHAT2_SEND_MESSAGE_FAIL')
        message_id=msg.get('id')
        status, signed=call('/'+room+'/attachments/'+attachment)
        require(status==200 and signed.get('success'),'CHAT2_MEDIA_ACCESS_FAIL')
        signed_url=(signed.get('data') or {}).get('url')
        parsed=urlparse(signed_url or '')
        require(parsed.scheme=='http' and parsed.hostname=='127.0.0.1' and parsed.port==9000
                and parsed.path.startswith('/gafus-refactor-documents-test/chat2/'),
                'CHAT2_UNEXPECTED_MEDIA_ORIGIN')
        with urlopen(signed_url,timeout=5) as file:
            require(file.status==200 and file.read()==image,'CHAT2_PRIVATE_MEDIA_READ_FAIL')
        status, response=call('/'+room+'/messages')
        require(status==200 and response.get('success') and any(x.get('id')==message_id for x in response.get('data',[])),'CHAT2_READ_MESSAGE_FAIL')
        status, response=call('/'+room+'/realtime')
        rt=response.get('data',{})
        require(status==200 and rt.get('token') and rt.get('channel')=='chat2:'+room,'CHAT2_AUTH_REALTIME_FAIL')
        status, response=call('/realtime/connect')
        require(status==200 and response.get('data',{}).get('token'),'CHAT2_CONNECT_TOKEN_FAIL')
        delivered=False
        for attempt in range(12):
            status=sql(f'''SELECT CASE WHEN "deliveredAt" IS NOT NULL THEN 'yes' ELSE 'no' END
                 FROM "Chat2OutboxEvent" WHERE "messageId"='{message_id}' LIMIT 1;''')
            if status=='yes': delivered=True; break
            time.sleep(0.35)
        require(delivered,'CHAT2_OUTBOX_WORKER_DELIVERY_FAIL')
        print('CHAT2_MANUAL_BROWSER_COOKIE_ORIGIN_CSRF_AUTH_HTTP_S3_REALTIME_PASS')
    finally:
        # Only exact test actor and the room it owns. Never truncate/reset DB.
        if user_created:
            if room:
                sql(f'''DELETE FROM "Chat2Conversation" WHERE "id"='{room}' AND "createdById"='{user_id}';''')
            sql(f'''DELETE FROM "User" WHERE "id"='{user_id}' AND "username"='{actor}';''')
        print('CHAT2_MANUAL_EPHEMERAL_ACCOUNT_CLEANED')
        if uploaded_key and signed_url:
            done=False
            for _ in range(45):
                state=sql(f'''SELECT "status" FROM "Chat2MediaDeletionIntent"
                    WHERE "objectKey"='{uploaded_key}' LIMIT 1;''')
                if state=='DONE':
                    done=True
                    break
                time.sleep(0.4)
            require(done,'CHAT2_S3_CASCADE_CLEANUP_NOT_CONFIRMED')
            try:
                with urlopen(signed_url,timeout=4):
                    raise RuntimeError('CHAT2_S3_OBJECT_STILL_PRESENT')
            except HTTPError as e:
                require(e.code==404,'CHAT2_S3_DELETE_UNEXPECTED_RESPONSE')
            print('CHAT2_MANUAL_S3_CASCADE_DELETE_VERIFIED')

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('CHAT2_LOCAL_SMOKE_FAIL',type(error).__name__,str(error)[:95])
        raise SystemExit(1)
