/** WEB5 R47: permitted isolated DEV Stream signed actor unread receipts.
 * No provider grants/permissions changes, no real users or production, and no API mocks. */
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {existsSync,lstatSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const output=join(root,'.design-verify/web5-dev-stream-two-identity-unread-r47');
const envPath=join(root,'.env.stream-chat-test');
if(process.cwd()!==root||existsSync(output)||!existsSync(envPath)||lstatSync(envPath).isSymbolicLink())
 throw Error('WEB5_R47_DEV_SAFE_ROOT_DENIED');
process.loadEnvFile(envPath);
const require=createRequire(join(root,'packages/core/package.json'));
if(!require.resolve('stream-chat').endsWith('/dist/cjs/index.node.js'))
 throw Error('WEB5_R47_STREAM_NODE_SDK_REQUIRED');
const {StreamChat}=require('stream-chat');
const key=process.env.STREAM_API_KEY,secret=process.env.STREAM_API_SECRET;
if(!key||!secret)throw Error('WEB5_R47_TEST_TENANT_CREDENTIALS_MISSING');
const server=StreamChat.getInstance(key,secret);
const settings=await server.getAppSettings();
if(String(settings.app?.id)!=='1730620'||settings.app?.disable_auth_checks||
 settings.app?.disable_permissions_checks)throw Error('WEB5_R47_DEV_PROVIDER_OR_AUTH_UNSAFE');
const type=await server.getChannelType('gafus_cynologist');
const grants=type.grants?.channel_member??[];
if(!grants.includes('read-channel')||grants.includes('schedule-message')||
 grants.some(g=>!['read-channel','read-channel-members'].includes(g)))
 throw Error('WEB5_R47_PROVIDER_GRANTS_REVIEW_DENIED');
const suffix=randomUUID().slice(0,12),channelName=`web5-unread-${suffix}`;
const actors=['reader','trainer','foreign'].map(role=>`gafus-web5-r47-${role}-${suffix}`);
const clients=[];let channel=null,created=false,success=false;
const receipts=[];
function record(key,value){receipts.push({key,value});console.log('WEB5_R47_'+key+'='+value);}
function requireReceipt(ok,name){if(!ok)throw Error('WEB5_R47_'+name+'_FAILED');record(name,'PASS');}
function actorRead(ch,actor){return ch.state.read?.[actor]??null;}
function unread(ch,actor){return actorRead(ch,actor)?.unread_messages??null;}
async function connect(actor){
 const client=new StreamChat(key,{allowServerSideConnect:true,logger:()=>{}});
 clients.push(client);
 await client.connectUser({id:actor},server.createToken(actor,Math.floor(Date.now()/1000)+600));
 return client;
}
async function messageObserved(channel,id){
 for(let attempt=0;attempt<25;attempt++){
  if(channel.state.messages.some(m=>m.id===id))return true;
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 return false;
}
try{
 await server.upsertUsers(actors.map(id=>({id,name:'WEB5 isolated unread test',role:'gafus_chat_reader'})));
 channel=server.channel('gafus_cynologist',channelName,{members:actors.slice(0,2),created_by_id:actors[1]});
 await channel.create();created=true;
 const readerClient=await connect(actors[0]), trainerClient=await connect(actors[1]);
 const reader=readerClient.channel('gafus_cynologist',channelName);
 const trainer=trainerClient.channel('gafus_cynologist',channelName);
 await reader.watch();await trainer.watch();
 requireReceipt(actorRead(reader,actors[0])!==null,'READER_SIGNED_BASELINE_PRESENT');
 requireReceipt(actorRead(trainer,actors[1])!==null,'TRAINER_SIGNED_BASELINE_PRESENT');
 const initAck=await reader.markRead();
 requireReceipt(initAck!==null&&initAck!==undefined,'READER_INITIAL_MARKREAD_ACK');
 const trainerInitAck=await trainer.markRead();
 requireReceipt(trainerInitAck!==null&&trainerInitAck!==undefined,'TRAINER_INITIAL_MARKREAD_ACK');
 const sent=await channel.sendMessage({text:'WEB5 R47 isolated unread incoming',user_id:actors[1]},
  {skip_push:true});
 requireReceipt(Boolean(sent.message?.id),'SERVER_SENT_AS_TRAINER');
 requireReceipt(await messageObserved(reader,sent.message.id),'READER_REALTIME_MESSAGE_RECEIVED');
 record('READER_UNREAD_AFTER_INCOMING',unread(reader,actors[0]));
 const beforeReload=unread(reader,actors[0]);
 requireReceipt(Number.isInteger(beforeReload)&&beforeReload>0,'READER_OWNER_UNREAD_INCREMENT');
 const trainerUnchanged=unread(trainer,actors[1]);
 record('TRAINER_UNREAD_FOR_OWN_SEND',trainerUnchanged);
 requireReceipt(trainerUnchanged===0,'TRAINER_OWN_SEND_NOT_UNREAD');
 await readerClient.disconnectUser();
 const readerReloadClient=await connect(actors[0]);
 const reloaded=readerReloadClient.channel('gafus_cynologist',channelName);
 await reloaded.watch();
 const afterReload=unread(reloaded,actors[0]);
 record('READER_SIGNED_UNREAD_AFTER_RECONNECT',afterReload);
 requireReceipt(Number.isInteger(afterReload)&&afterReload>0,'READER_UNREAD_RELOAD_PERSISTED');
 const readAck=await reloaded.markRead();
 requireReceipt(readAck!==null&&readAck!==undefined,'READER_MARKREAD_ACK');
 await reloaded.query({messages:{limit:20}});
 const afterRead=unread(reloaded,actors[0]);
 record('READER_SIGNED_UNREAD_AFTER_MARKREAD',afterRead);
 requireReceipt(afterRead===0,'READER_UNREAD_CLEARED_ONLY_AFTER_ACK');
 requireReceipt(unread(trainer,actors[1])===0,'TRAINER_UNREAD_STILL_INDEPENDENT');
 let foreignDenied=false;
 const foreign=await connect(actors[2]);
 try{await foreign.channel('gafus_cynologist',channelName).watch();}
 catch(e){foreignDenied=e?.code===17;}
 requireReceipt(foreignDenied,'FOREIGN_MEMBER_READ_DENIED');
 const final=await reloaded.query({messages:{limit:20}});
 requireReceipt(final.messages.some(m=>m.id===sent.message.id),'RELOAD_MESSAGE_PERSISTENCE');
 success=true;
}finally{
 for(const client of clients)try{await client.disconnectUser();}catch{}
 if(created){try{await channel.delete({hard_delete:true});record('SYNTHETIC_CHANNEL_DELETED','PASS');}
  catch{record('SYNTHETIC_CHANNEL_DELETED','FAIL');success=false;}}
 try{await server.deleteUsers(actors,{user:'hard',messages:'hard'});
  record('SYNTHETIC_USERS_DELETED','PASS');}
 catch{record('SYNTHETIC_USERS_DELETED','FAIL');success=false;}
 mkdirSync(output);
 writeFileSync(join(output,'receipt.json'),JSON.stringify({
  kind:'live DEV Stream with 2 signed members; no mocks, no changes to grants',
  result:success?'PASS':'FAIL',receipts},null,2));
}
if(!success)process.exitCode=1;
