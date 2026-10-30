import {createElement,type ReactElement} from "react";
import {TrainerBookingTransitionAction,type TrainerBookingRecord} from "./TrainerBookingTransitionAction";
import type {PanelActor} from "./consultationContract";
export type {TrainerBookingRecord} from "./TrainerBookingTransitionAction";
type Session={actor:PanelActor;token:string|null;authEpoch?:string};
export type TrainerBookingActionProps={
  booking:TrainerBookingRecord;actor:PanelActor;token:string;
  authEpoch?:string;getCurrentSession?:()=>Session|null;fetchImpl:typeof fetch;
  onVerifiedRefresh:(bookings:TrainerBookingRecord[])=>void;
  beginMutation?:(bookingId:string,status:string)=>boolean;
};
export function TrainerBookingConfirmAction(p:TrainerBookingActionProps):ReactElement|null{
  return createElement(TrainerBookingTransitionAction,{...p,mode:"confirm"});
}
export function TrainerBookingCompleteAction(p:TrainerBookingActionProps):ReactElement|null{
  return createElement(TrainerBookingTransitionAction,{...p,mode:"complete"});
}
export function TrainerBookingNoShowAction(p:TrainerBookingActionProps):ReactElement|null{
  return createElement(TrainerBookingTransitionAction,{...p,mode:"noShow"});
}

export function TrainerBookingRejectAction(p:TrainerBookingActionProps):ReactElement|null{
  return createElement(TrainerBookingTransitionAction,{...p,mode:"reject"});
}
