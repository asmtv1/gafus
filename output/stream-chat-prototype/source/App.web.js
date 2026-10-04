import React,{useMemo,useState} from 'react';
import {Chat,Channel,Window,MessageList,MessageComposer,ChannelHeader,useCreateChatClient} from 'stream-chat-react';
import 'stream-chat-react/css/index.css';
function Connected({session,onExit}){
 const userData=useMemo(()=>({id:session.id}),[session.id]);
 const client=useCreateChatClient({apiKey:session.key,tokenOrProvider:session.token,userData});
 const channel=useMemo(()=>client?.channel('messaging',session.channel),[client,session.channel]);
 if(!client)return <p>Подключение…</p>;
 return <div style={{height:'100vh',width:'100%',maxWidth:800,margin:'0 auto',display:'flex',flexDirection:'column'}}><button onClick={onExit}>Выйти из тестового чата</button><div style={{flex:1,minHeight:0}}><Chat client={client}><Channel channel={channel}><Window><ChannelHeader/><MessageList/><MessageComposer/></Window></Channel></Chat></div></div>;
}
export default function App(){const [session,setSession]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function login(role){setBusy(true);setError('');try{const r=await fetch('http://localhost:4318/session?role='+role);if(!r.ok)throw Error();setSession(await r.json());}catch{setError('Не удалось получить тестовую сессию');}finally{setBusy(false);}}
 return session?<Connected session={session} onExit={()=>setSession(null)}/>:<main style={{padding:32}}><h1>GAFUS — тест Stream</h1><p>Только синтетическая переписка. Выберите роль.</p><button disabled={busy} onClick={()=>login('client')}>Войти как клиент</button> <button disabled={busy} onClick={()=>login('trainer')}>Войти как кинолог</button><p>{error}</p></main>;
}
