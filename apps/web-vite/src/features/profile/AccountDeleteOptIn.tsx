import { Loading } from "../../shared/ui";
/** WEB-URL-038: thin opt-in to existing canonical G04 AccountDeletionS1Form.
 * The G04 form is the ONLY destructive-review form; this file adds just
 * owner/eligibility guards and an adapter to the existing G04 consumer.
 * No real Hono POST or provider calls are available here.
 */
import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {AccountDeletionS1Form} from "../account/AccountDeletionS1Form";
import {
 createG04SourceMockConsumer,type G04FixtureWire,
} from "../account/g04SourceMockConsumer";
import {
 CODE_PATH,DELETE_PATH,projectDeletionEligibility,projectSessionReadback,
 type SyntheticAccountDeletion,
} from "./accountDeleteReview";
import {PrimaryButton,SecondaryButton} from "../../shared/ui";
const id=/^[A-Za-z0-9_-]{1,128}$/;
function G04ProfileBound({ownerId,username,wire,isCurrent,onBack}:{
 ownerId:string;username:string;wire:SyntheticAccountDeletion;
 isCurrent:()=>boolean;onBack:()=>void;
}){
 const eligibility=useQuery({
  queryKey:["account-delete","synthetic-eligibility",ownerId],
  queryFn:async()=>{
   const result=projectDeletionEligibility(await wire.eligibility({ownerId}));
   if(!isCurrent())throw Error("STALE_DELETE_PRINCIPAL");
   return result;
  },retry:false,staleTime:0,gcTime:0,
 });
 // Existing canonical G04 consumer is the single authority for POST shapes,
 // verdict classification and one-shot, unknown / session-epoch semantics.
 const fixture:G04FixtureWire=async request=>{
  if(!isCurrent())throw Error("STALE_OWNER");
  try{
   const response=request.operation==="requestCode"?
    await wire.requestCode({ownerId,method:"POST",
      path:CODE_PATH}):
    await wire.submit({ownerId,method:"POST",
      path:DELETE_PATH,json:{code:(request.json as {code:string}).code}});
   if(!isCurrent())throw Error("STALE_OWNER");
   return {status:200,body:response};
  }catch(error){
   if(!isCurrent())throw Error("STALE_OWNER");
   const status=typeof error==="object"&&error!==null&&
    "status" in error&&typeof error.status==="number"?error.status:503;
   return {status,body:{success:false}};
  }
 };
 if(!isCurrent())return <p role="alert">Сессия изменилась.
  Откройте профиль заново.</p>;
 if(eligibility.isPending)return <section className="delete-review"
  aria-label="Удаление аккаунта (макет)">
  <Loading message="Проверяем возможность подтверждения…" /></section>;
 if(eligibility.isError)return <section className="delete-review"
  aria-label="Удаление аккаунта (макет)"><p role="alert">
  Не удалось подтвердить доступность функции.</p>
  <PrimaryButton type="button" onClick={()=>void eligibility.refetch()}>Повторить проверку</PrimaryButton>
  </section>;
 return <section className="delete-review" aria-label="Удаление аккаунта (макет)">
  <AccountDeletionS1Form actorId={ownerId}
    hasVerifiedEmail={eligibility.data.emailReady}
    requiredUsername={username} onBack={onBack}
    readback={async()=>{
      const r=projectSessionReadback(await wire.readback({
        ownerId,method:"GET",path:"/api/v1/auth/me",
      }));
      return r;
    }}
    consumer={createG04SourceMockConsumer(fixture)}/>
  </section>;
}
export function AccountDeleteOptIn({enabled,ownerId,username,
 wire,isCurrent}:{
 enabled:boolean;ownerId:string;username:string;
 wire?:SyntheticAccountDeletion;isCurrent:()=>boolean;
}){
 const [open,setOpen]=useState(false);
 if(!enabled||wire?.fixtureKind!=="AG2_ACCOUNT_DELETE_REVIEW_SYNTHETIC_NEVER_REAL"||
  !id.test(ownerId)||!id.test(username))return null;
 if(!isCurrent())return <p role="alert">Сессия изменилась.
  Откройте профиль заново.</p>;
 if(!open)return <div className="delete-review-entry"><SecondaryButton variant="red" type="button"
  onClick={()=>setOpen(true)}>Удаление аккаунта (макет)</SecondaryButton></div>;
 return <G04ProfileBound ownerId={ownerId} username={username}
  wire={wire} isCurrent={isCurrent} onBack={()=>setOpen(false)}/>;
}
