import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {MessageProvider, ChannelActionProvider} from "stream-chat-react";
import {ChatQuotedReply} from "../../../apps/web/src/features/cynologist-chat/ChatQuotedReply";
function Preview(){
 const [jumped,setJumped]=useState(false);
 const quote={id:"original",text:"Проверка работы чата",user:{name:"admin"},type:"regular"};
 const message={id:"answer",text:"Работает",quoted_message:quote};
 return <ChannelActionProvider value={{jumpToMessage:async()=>setJumped(true)} as any}><MessageProvider value={{message} as any}>
 <div style={{width:"min(390px,100%)",margin:"40px auto",padding:20,fontFamily:"Arial"}}>
 <div style={{marginBottom:32,padding:12,background:jumped?"#d6dfae":"#e9edef",borderRadius:12}} id="original"><strong style={{fontSize:12,color:"#4d5c2d"}}>admin</strong><p>Проверка работы чата</p></div>
 <div style={{marginLeft:65,background:"#e3ecff",borderRadius:"18px 18px 0 18px",padding:12}}><ChatQuotedReply/><div style={{fontSize:20,padding:"6px 4px"}}>Работает</div></div>
 {jumped&&<p role="status">Переход к исходному сообщению</p>}
 </div></MessageProvider></ChannelActionProvider>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
