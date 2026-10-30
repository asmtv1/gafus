import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {QueryClient,QueryClientProvider,useInfiniteQuery,
  useQuery,useQueryClient} from "@tanstack/react-query";
import type {AuthUser} from "../../shared/auth/authApi";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {useRouteSearch} from "../../shared/router/location";
import {projectDetailPost,projectDetailComments,projectFocusedComment,
  detailCommentId,type DetailWire} from "./postDetailReadApi";

function Detail({owner,postId,wire,current,onClose}:{
 owner:string;postId:string;wire:DetailWire;
 current:()=>boolean;onClose:()=>void;
}){
 const search=useRouteSearch();
 const focusId=detailCommentId(search);
 const post=useQuery({
   queryKey:["post-detail","owner",owner,postId],
   queryFn:async()=>{
     const value=projectDetailPost(await wire.post(postId),postId);
     if(!current())throw Error("STALE_POST");
     return value;
   },retry:false,gcTime:0,staleTime:0,
 });
 const comments=useInfiniteQuery({
   queryKey:["post-detail","owner",owner,postId,"comments"],
   queryFn:async({pageParam})=>{
     const value=projectDetailComments(await wire.comments(postId,pageParam),postId);
     if(!current())throw Error("STALE_COMMENTS");
     return value;
   },
   initialPageParam:null as string|null,
   getNextPageParam:page=>page.nextCursor??undefined,
   enabled:post.isSuccess,retry:false,gcTime:0,staleTime:0,
 });
 const focused=useQuery({
   queryKey:["post-detail","owner",owner,postId,"focus",focusId],
   queryFn:async()=>{
     if(!focusId)throw Error("INVALID_FOCUS");
     const value=projectFocusedComment(await wire.focused(focusId),postId,focusId);
     if(!current())throw Error("STALE_FOCUS");
     return value;
   },
   enabled:post.isSuccess&&focusId!==null,
   retry:false,gcTime:0,staleTime:0,
 });
 const seen=new Set<string>();
 const rows=comments.data?.pages.flatMap(p=>p.items).filter(row=>{
   if(seen.has(row.id))return false;seen.add(row.id);return true;
 })??[];
 if(!current())return <p role="alert">
   Сессия изменилась. Откройте «Моменты» заново.</p>;
 return <section className="post-detail-readonly" aria-label="Публикация и комментарии (макет)">
   <header><h3>Публикация</h3>
     <BackButton type="button" onClick={onClose}>К «Моментам»</BackButton></header>
   <p className="note">Синтетическое чтение Feed API. Реакции,
     комментарии и просмотры не отправляются.</p>
   {post.isPending&&<Loading message="Загружаем публикацию…" />}
   {post.isError&&<div role="alert">
     <p>Публикация недоступна или удалена.</p>
     <PrimaryButton type="button" onClick={()=>void post.refetch()}>
       Повторить публикацию</PrimaryButton></div>}
   {post.isSuccess&&<>
     <article className="compact-card">
       <h4>{post.data.authorName} @{post.data.username}</h4>
       {post.data.roleBadge&&<span>{post.data.roleBadge}</span>}
       <p className="article-plain-text">{post.data.text}</p>
       {post.data.media.length>0&&<p className="note">
         Медиа: {post.data.media.length} (ссылки не отображаются)</p>}
       {post.data.hasPoll&&<p className="note">В публикации есть опрос</p>}
       <p>{post.data.commentCount} комментариев · {post.data.viewCount} просмотров</p>
     </article>
     {focusId&&<aside aria-label="Комментарий из уведомления">
       {focused.isPending&&<p role="status">Ищем комментарий из ссылки…</p>}
       {focused.isError&&<p role="alert">
         Комментарий из ссылки недоступен или относится к другой публикации.</p>}
       {focused.isSuccess&&<p className="post-focused-comment">
         Комментарий из ссылки: {focused.data.deleted?
           "Комментарий удалён":focused.data.text}
       </p>}
     </aside>}
     <section aria-label="Комментарии к публикации">
       <h4>Комментарии</h4>
       {comments.isPending&&<Loading message="Загружаем комментарии…" />}
       {comments.isError&&<div role="alert">
         <p>Не удалось загрузить комментарии.</p>
         <PrimaryButton type="button" onClick={()=>void comments.refetch()}>
           Повторить комментарии</PrimaryButton></div>}
       {comments.isSuccess&&rows.length===0&&
         <p role="status">Комментариев пока нет.</p>}
       {comments.isSuccess&&rows.length>0&&
         <ul className="post-detail-comments">{rows.map(row=>
           <li key={row.id} className="compact-card">
             <strong>{row.authorName}</strong>
             <p>{row.deleted?"Комментарий удалён":row.text}</p>
             {row.replyCount>0&&<span className="note">
               Ответов: {row.replyCount}</span>}
           </li>)}</ul>}
       {comments.hasNextPage&&<button type="button"
         disabled={comments.isFetchingNextPage}
         onClick={()=>void comments.fetchNextPage()}>
         {comments.isFetchingNextPage?"Загружаем…":"Ещё комментарии"}</button>}
       {comments.isFetchNextPageError&&<p role="alert">
         Не удалось загрузить следующую страницу комментариев.</p>}
     </section>
   </>}
 </section>;
}
function BoundDetail({owner,postId,wire}:{owner:string;postId:string;wire:DetailWire}){
 const global=useQueryClient();
 const initial=useRef(global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null);
 const epoch=useRef(0),last=useRef(initial.current);
 const revision=useSyncExternalStore(cb=>global.getQueryCache().subscribe(event=>{
   if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
     event.query.queryKey.every((part:unknown,i:number)=>part===CURRENT_USER_QUERY_KEY[i])){
     const next=global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null;
     if(next!==last.current&&(next!==null||event.type==="removed"||
       event.query.state.data===null)){
       last.current=next;epoch.current++;cb();
     }
   }
 }),()=>epoch.current,()=>epoch.current);
 const [open,setOpen]=useState(false);
 const [privateCache]=useState(()=>new QueryClient({defaultOptions:{
   queries:{retry:false,staleTime:0,gcTime:0,refetchOnWindowFocus:false},
 }}));
 useEffect(()=>()=>{void privateCache.cancelQueries();privateCache.clear();},[privateCache]);
 const current=()=>epoch.current===0&&
   global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===owner;
 if(initial.current!==owner||revision!==0||!current())return <p role="alert">
   Сессия изменилась. Откройте «Моменты» заново.</p>;
 if(!open)return <div className="post-detail-optin-entry">
   <button type="button" onClick={()=>setOpen(true)}>
     Просмотреть публикацию (макет)</button>
 </div>;
 return <QueryClientProvider client={privateCache}>
   <Detail owner={owner} postId={postId} wire={wire} current={current}
     onClose={()=>{void privateCache.cancelQueries();privateCache.clear();
       setOpen(false);}}/>
 </QueryClientProvider>;
}
export function PostDetailOptIn({enabled,ownerId,postId,transport}:{
 enabled:boolean;ownerId:string;postId:string;transport?:DetailWire;
}){
 if(!enabled||!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId)||
   !/^[A-Za-z0-9_-]{1,128}$/.test(postId)||
   transport?.fixtureKind!=="AG2_POST_DETAIL_SYNTHETIC_GET_ONLY")return null;
 return <BoundDetail key={postId} owner={ownerId} postId={postId}
   wire={transport}/>;
}
