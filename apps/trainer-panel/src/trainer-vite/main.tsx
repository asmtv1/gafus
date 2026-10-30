import {mountTrainerEntry} from "./mountTrainerEntry";
import type {PanelActor} from "./consultationContract";
declare global {
  interface Window {
    __AG4_TRAINER_TEST_SESSION__?:{
      actor:PanelActor;token:string;fetchImpl?:typeof fetch;
    };
  }
}
const mount=document.querySelector("#ag4-optin");
if(!mount)throw Error("Missing test route root");
const test=window.__AG4_TRAINER_TEST_SESSION__;
mountTrainerEntry(mount,{pathname:window.location.pathname,actor:test?.actor??{role:"GUEST",id:""},token:test?.token??null,fetchImpl:test?.fetchImpl??fetch});
