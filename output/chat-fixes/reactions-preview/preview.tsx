import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatProvider, MessageProvider } from "stream-chat-react";
import { ChatReactionContext, ChatReactionPicker, ChatReactionList } from "../../../apps/web/src/features/cynologist-chat/ChatReactions";
import { CHAT_REACTIONS } from "@gafus/consultation-shared";
import styles from "../../../apps/web/src/features/cynologist-chat/chat.module.css";
function Preview() {
  const [own, setOwn] = useState("love");
  const [open, setOpen] = useState(true);
  const message = { id: "preview", type: "regular", text: "Проверка работы чата", user: { id: "admin", name: "admin" }, own_reactions: own ? [{ type: own, user_id: "me" }] : [], reaction_groups: Object.fromEntries(CHAT_REACTIONS.slice(0,3).map(r => [r.type, { count: r.type === own ? 3 : 2 }] )) };
  return <ChatProvider value={{ client: { queryReactions: async () => ({ reactions: [{user_id:"admin",user:{name:"admin"}},{user_id:"trainer",user:{name:"Кинолог"}}] }) } } as any}>
    <ChatReactionContext.Provider value={{ enabled: true, pending: false, change: (_id,type,remove) => {setOwn(remove ? "" : type); setOpen(false);} }}>
      <MessageProvider value={{message, isMyMessage: () => false} as any}>
        <div style={{maxWidth:520,margin:"80px auto",padding:24}}>
          <h2 style={{color:"#4d5c2d"}}>Общий чат</h2>
          <strong style={{color:"#4d5c2d"}}>admin</strong>
          <div style={{background:"#e9edef",padding:"14px 20px",borderRadius:"18px 18px 18px 0",fontSize:20,marginTop:8}} onDoubleClick={()=>setOwn(own==="like"?"":"like")} onContextMenu={e=>{e.preventDefault();setOpen(true)}}>Проверка работы чата</div>
          <ChatReactionList/>
          <div className={styles.messageMenu} style={{position:"relative",marginTop:20,width:320}}>
            {open ? <><ChatReactionPicker close={()=>setOpen(false)}/><button>↩ Ответить</button><button>▢ Копировать</button></> : <button onClick={()=>setOpen(true)}>Открыть меню сообщения</button>}
          </div>
        </div>
      </MessageProvider>
    </ChatReactionContext.Provider>
  </ChatProvider>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
