import { useEffect, useMemo, useState } from "react";
import { requestAdmin } from "../api";

export type PageQuery = {page:number;pageSize:number;search:string;status?:string};
export type AdminPage<T> = {items:T[];pagination:PageQuery & {total:number}};
export function parseAdminPage<T>(value:unknown, validRows:(value:unknown)=>value is T[]):AdminPage<T>|null {
  if (!value || typeof value!=="object") return null;
  const v=value as Partial<AdminPage<T>>;
  const p=v.pagination;
  if (!p || !validRows(v.items) || !Number.isSafeInteger(p.page) || p.page<1 ||
      ![25,50,100].includes(p.pageSize) || !Number.isSafeInteger(p.total) || p.total<0 ||
      p.page>Math.max(1,Math.ceil(p.total/p.pageSize)) ||
      typeof p.search!=="string" || p.search.length>128 ||
      (p.status!==undefined && typeof p.status!=="string") || v.items.length>p.pageSize) return null;
  return {items:v.items,pagination:p};
}
function match<T>(value:AdminPage<T>|null, query:PageQuery) {
  return !!value && value.pagination.page===query.page && value.pagination.pageSize===query.pageSize &&
    value.pagination.search===query.search && value.pagination.status===query.status;
}

/** Owns only the currently mounted panel's request. Old pages cannot be
 * presented as fresh search results; stale responses are aborted/ignored. */
export function useBoundedAdminPage<T>(source:unknown, endpoint:string,
  validRows:(value:unknown)=>value is T[], search:string,status?:string) {
  const initial=useMemo(()=>parseAdminPage(source,validRows),[source,validRows]);
  const [page,setPage]=useState(1), [pageSize,setPageSize]=useState(initial?.pagination.pageSize??25);
  const [remote,setRemote]=useState<{requested:PageQuery;data:AdminPage<T>}|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
  const [attempt,setAttempt]=useState(0);
  const query=useMemo<PageQuery>(()=>({page,pageSize,search:search.trim().slice(0,128),
    ...(status===undefined?{}:{status})}),[page,pageSize,search,status]);
  useEffect(()=>{
    if (!initial || match(initial,query)) {setRemote(null);setError(null);setLoading(false);return;}
    const controller=new AbortController();
    setLoading(true);setError(null);
    const timer=setTimeout(()=>{
      const params=new URLSearchParams(Object.entries(query).map(([k,v])=>[k,String(v)]));
      void requestAdmin<unknown>(endpoint+"?"+params,{signal:controller.signal}).then(value=>{
        if(controller.signal.aborted)return;
        const next=parseAdminPage(value,validRows);
        if (!next || next.pagination.search!==query.search || next.pagination.pageSize!==query.pageSize ||
            next.pagination.status!==query.status || next.pagination.page>query.page)
          throw Error("Некорректный ответ страницы");
        setRemote({requested:query,data:next});
      }).catch(cause=>{
        if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Не удалось загрузить страницу");
      }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },250);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[initial,endpoint,validRows,query,attempt]);
  const data=remote && remote.requested.page===query.page && remote.requested.pageSize===query.pageSize &&
    remote.requested.search===query.search && remote.requested.status===query.status ? remote.data : match(initial,query)?initial:null;
  return {paged:!!initial,data,loading,error,query,
    setPage,setPageSize:(size:number)=>{setPageSize(size);setPage(1);},resetPage:()=>setPage(1),
    retry:()=>setAttempt(n=>n+1)};
}
