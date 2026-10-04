// LOCAL SYNTHETIC TEST ONLY. Never deploy this role selector.
const http = require('node:http');
const fs = require('node:fs');
const { StreamChat } = require('stream-chat');
const file = process.env.STREAM_TEST_ENV_FILE;
const env = file ? Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter(s => s.includes('=')).map(s => { const i=s.indexOf('='); return [s.slice(0,i).trim(),s.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]; })) : process.env;
if(!env.STREAM_API_KEY || !env.STREAM_API_SECRET) throw new Error('Missing server credentials');
const client = new StreamChat(env.STREAM_API_KEY,env.STREAM_API_SECRET,{logger:()=>{}});
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.method!=='GET'||url.pathname!=='/session'){res.writeHead(404).end();return;}
 const id=url.searchParams.get('role')==='trainer'?'gafus-preflight-trainer':'gafus-preflight-client';
 res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'http://localhost:8087','Cache-Control':'no-store'});
 res.end(JSON.stringify({key:env.STREAM_API_KEY,id,channel:'gafus-preflight-20261001',token:client.createToken(id,Math.floor(Date.now()/1000)+3600)}));
}).listen(4318,'127.0.0.1',()=>console.log('Local synthetic session server on port 4318'));
