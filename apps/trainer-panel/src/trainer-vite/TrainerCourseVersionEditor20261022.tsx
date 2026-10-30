import {createElement,useEffect,useState,type ReactElement} from 'react';
import type {PanelActor} from './consultationContract';
/** TR012 local UI seam ONLY. AG1 must provide the real registered request mapping. */
import type {TrainerCourseVersionName} from '@gafus/types';
export type VersionedName=TrainerCourseVersionName;
export type VersionedCourseOperations={read:(courseId:string,signal:AbortSignal)=>Promise<VersionedName>;save:(payload:{courseId:string;name:string;expectedVersion:number},signal:AbortSignal)=>Promise<{status:200;data:VersionedName}|{status:409}|{status:401|403|404|500}>};
export type VersionEditorProps={pathname:string;actor:PanelActor;token:string|null;authEpoch?:string;enabled?:boolean;ops?:VersionedCourseOperations;getCurrentSession?:()=>{actor:PanelActor;token:string|null;authEpoch?:string}|null};
const safe=/^\/main-panel\/courses\/([A-Za-z0-9_-]{1,128})\/edit\/?$/;
function valid(d:VersionedName,courseId:string){return d.id===courseId&&Number.isInteger(d.version)&&d.version>=1&&d.version<=2147483647&&typeof d.name==='string'&&d.name.length<=500;}
export function TrainerCourseVersionEditor20261022(p:VersionEditorProps):ReactElement{
 const courseId=safe.exec(p.pathname)?.[1]??null;
 const [view,setView]=useState<{key:string;phase:'loading'|'ready'|'error'|'conflict'|'saving';name:string;version:number|null;serverName:string}>({key:'',phase:'loading',name:'',version:null,serverName:''});
 const [reload,setReload]=useState(0);
 const [saving,setSaving]=useState(false);
 const principal=JSON.stringify([p.actor.id,p.actor.role,p.token,p.authEpoch]);
 const key=JSON.stringify([principal,courseId]);
 const check=()=>{const current=p.getCurrentSession?p.getCurrentSession():{actor:p.actor,token:p.token,authEpoch:p.authEpoch};return !!current&&current.actor.id===p.actor.id&&current.actor.role===p.actor.role&&current.token===p.token&&current.authEpoch===p.authEpoch;};
 const allowed=p.enabled===true&&!!p.ops&&!!p.token&&!!p.authEpoch&&!!courseId&&['TRAINER','ADMIN'].includes(p.actor.role)&&check();
 useEffect(()=>{let active=true;const controller=new AbortController();setSaving(false);setView(v=>({key,phase:'loading',name:v.key===key?v.name:'',version:null,serverName:''}));if(allowed&&courseId){void p.ops!.read(courseId,controller.signal).then(d=>{if(!active||!check())return;if(!valid(d,courseId))throw Error('BAD_DTO');setView(v=>({key,phase:'ready',name:v.key===key&&v.name!==''?v.name:d.name,version:d.version,serverName:d.name}));}).catch(()=>{if(active&&check())setView(v=>({...v,key,phase:'error'}));});}return()=>{active=false;controller.abort();};},[allowed,key,reload,p.ops,courseId]);
 if(!allowed)return createElement('main',null,createElement('p',{role:'alert'},'Редактор выключен или доступ не подтверждён'));
 const current=view.key===key?view:{key,phase:'loading' as const,name:'',version:null,serverName:''};
 const save=async()=>{if(!courseId||!p.ops||saving||!check()||current.version===null||current.phase!=='ready'||!current.name.trim())return;setSaving(true);const controller=new AbortController();const previous={...current,version:current.version};setView(v=>({...v,phase:'saving'}));try{const response=await p.ops.save({courseId,name:previous.name,expectedVersion:previous.version!},controller.signal);if(!check())return;if(response.status===409){setView(v=>({...v,phase:'conflict',version:null}));return;}if(response.status!==200||!valid(response.data,courseId)){setView(v=>({...v,phase:'error'}));return;}setView({key,phase:'ready',name:response.data.name,version:response.data.version,serverName:response.data.name});}catch{if(check())setView(v=>({...v,phase:'error'}));}finally{setSaving(false);}};
 return createElement('main',{'data-tr012-version-editor':'synthetic'},createElement('h1',null,'Редактирование курса'),
 createElement('p',{'data-tr012-name-only':'true'},'Сейчас доступно только редактирование названия. Полная форма будет доступна после серверного ответа с полями и версией в одном снимке.'),
 current.phase==='loading'?createElement('p',{role:'status'},'Загрузка курса'):null,
 current.phase==='error'?createElement('p',{role:'alert'},'Не удалось выполнить операцию'):null,
 current.phase==='conflict'?createElement('p',{role:'alert'},'Конфликт версии (409). Ваши изменения сохранены. Обновите данные явно, затем проверьте ввод перед сохранением.'):null,
 createElement('label',null,'Название курса ',createElement('input',{'aria-label':'Название курса',value:current.name,onChange:e=>{const name=(e.currentTarget as HTMLInputElement).value;setView(v=>({...v,name}));},disabled:current.phase==='loading'})),
 createElement('p',null,'Версия: ',current.version===null?'не подтверждена':String(current.version)),
 createElement('button',{type:'button',disabled:current.phase!=='ready'||saving,onClick:()=>{void save();}},'Сохранить'),
 createElement('button',{type:'button',onClick:()=>setReload(x=>x+1)},'Обновить данные'),
 current.phase==='conflict'?createElement('p',null,'Ввод не отправляется повторно автоматически'):null);
}
