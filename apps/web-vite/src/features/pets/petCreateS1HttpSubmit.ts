/**
 * G05 Web same-origin cookie POST transport, used by the actual /profile/addPet
 * route. No automatic create retry on 401, 503 or lost ACK.
 */
import {ApiError,apiRequest} from "../../shared/api/client";
import {refreshSession,type AuthUser} from "../../shared/auth/authApi";
import type {PetReply} from "./petCreateS1";
import type {PetCreateJsonProposalS1} from "./petCreateIntentS1";

/** One single-shot create attempt. Never attach unsupported Idempotency-Key. */
export async function submitPetCreateS1ViaCookieApi(
  json:PetCreateJsonProposalS1,
):Promise<PetReply>{
  try {
    const data=await apiRequest<unknown>("/api/v1/pets",{
      method:"POST",json,browserAuth:true,expectedStatus:201,
    });
    return {status:201,body:{success:true,data}};
  } catch(error) {
    // Preserve only status/code for the S1 verdict; raw backend error and
    // credentials must never reach the rendered form.
    if(error instanceof ApiError) {
      return {status:error.status,body:{success:false,code:error.code}};
    }
    // A TCP reset can happen AFTER SQL COMMIT: caller must mark UNKNOWN.
    throw new Error("G05_WEB_CREATE_RESULT_UNCONFIRMED");
  }
}

/**
 * Only after an EXPLICIT user refresh action following 401. Refreshes the
 * cookie, then verifies the current /me principal with NO automatic /me retry.
 * Returning true does NOT trigger a create POST; form authorizes a second
 * manual click only if its own Query principal/authEpoch did not change.
 */
export async function refreshPetCreateS1SameOwner(
  ownerId:string,
):Promise<boolean>{
  if(!ownerId)return false;
  try{
    await refreshSession();
    const user=await apiRequest<AuthUser>("/api/v1/auth/me",{
      browserAuth:true,
    });
    return user?.id===ownerId;
  }catch{
    // Refresh or /me may fail. Never infer safe reauthorization.
    return false;
  }
}
