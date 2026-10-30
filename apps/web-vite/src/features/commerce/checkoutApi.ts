import { apiRequest, ApiError } from "../../shared/api/client";
import type { AppSubscriptionOfferDto, AppSubscriptionPlanOfferDto, AppSubscriptionStatusDto } from "../../../../../packages/core/src/services/appSubscription/types";

export type CheckoutPlan = AppSubscriptionPlanOfferDto & {code:"TWO_WEEKS"|"MONTHLY"|"THREE_MONTHS"};
export type PromoPreview = {code:string;revision:number;planCode:"MONTHLY"|"THREE_MONTHS";discountPercent:number;originalPriceRub:number;discountedPriceRub:number;renewalPriceRub:number;intervalDays:number;currency:"RUB"};
const planCodes = ["TWO_WEEKS", "MONTHLY", "THREE_MONTHS"];
export function validatedCheckoutPlans(offer:AppSubscriptionOfferDto):CheckoutPlan[] {
  if(!offer||typeof offer!=="object"||!Array.isArray(offer.yookassaPlans))
    throw Error("Сервер не подтвердил тарифы подписки");
  const codes=new Set<string>(); const plans:CheckoutPlan[]=[];
  for(const p of offer.yookassaPlans){
    if(!p||typeof p!=="object"||typeof p.code!=="string"||!planCodes.includes(p.code)||codes.has(p.code)||
      typeof p.enabled!=="boolean"||typeof p.title!=="string"||!p.title.trim()||p.title.length>100||
      p.currency!=="RUB"||!Number.isSafeInteger(p.yookassaPriceRub)||p.yookassaPriceRub<=0||
      !Number.isSafeInteger(p.intervalDays)||p.intervalDays<=0||typeof p.promoCodeEligible!=="boolean")
      throw Error("Некорректное предложение подписки");
    codes.add(p.code); if(p.enabled)plans.push(p as CheckoutPlan);
  }
  return plans;
}
export function validatePromoPreview(raw:PromoPreview,plan:CheckoutPlan):PromoPreview {
  if(!raw||typeof raw!=="object"||raw.currency!=="RUB"||raw.planCode!==plan.code||
    typeof raw.code!=="string"||!/^[A-Za-z0-9_-]{3,64}$/.test(raw.code)||
    !Number.isSafeInteger(raw.revision)||raw.revision<=0||
    !Number.isInteger(raw.discountPercent)||raw.discountPercent<0||raw.discountPercent>100||
    raw.originalPriceRub!==plan.yookassaPriceRub||
    !Number.isFinite(raw.discountedPriceRub)||raw.discountedPriceRub<0||
    raw.discountedPriceRub>raw.originalPriceRub||
    !Number.isFinite(raw.renewalPriceRub)||raw.renewalPriceRub<0||
    raw.intervalDays!==plan.intervalDays)throw Error("Некорректный расчёт промокода");
  return raw;
}
export function checkedPaymentUrl(raw:unknown):string {
  if(typeof raw!=="string"||raw.length>4096)throw Error("Ссылка ЮKassa не получена");
  try {const u=new URL(raw);if(u.protocol==="https:"&&u.hostname&&!u.username&&!u.password)return u.href;}
  catch {/* Reject malformed provider URL. */}
  throw Error("Платёжная система вернула недопустимую ссылку");
}
export const getCheckoutOffer=()=>apiRequest<AppSubscriptionOfferDto>("/api/v1/app-subscription/offer",{browserAuth:true,expectedStatus:200});
export const getCheckoutStatus=()=>apiRequest<AppSubscriptionStatusDto>("/api/v1/app-subscription/status",{browserAuth:true,expectedStatus:200});
export async function previewCheckoutPromo(plan:CheckoutPlan,promoCode:string) {
  if(plan.code!=="MONTHLY"&&plan.code!=="THREE_MONTHS")throw new ApiError(400,"Промокод для этого тарифа недоступен","PROMO_CODE_NOT_ELIGIBLE");
  const raw=await apiRequest<PromoPreview>("/api/v1/app-subscription/promo-code/preview",{
    method:"POST",browserAuth:true,expectedStatus:200,json:{planCode:plan.code,promoCode},
  });return validatePromoPreview(raw,plan);
}
export async function createCheckoutPayment(
  planCode:CheckoutPlan["code"],promo?:PromoPreview,returnPath?:string,
) {
  if(returnPath!==undefined&&!/^\/consultations\/[A-Za-z0-9_-]{1,128}$/.test(returnPath))
    throw new Error("Некорректный адрес возврата после оплаты");
  const result=await apiRequest<{confirmationUrl:string;localSubscriptionId:string}>("/api/v1/app-subscription/yookassa/start",{
    method:"POST",browserAuth:true,expectedStatus:200,
    json:{planCode,...(promo?{promoCode:{code:promo.code,revision:promo.revision}}:{}),
      ...(returnPath?{returnPath}:{})},
  });return checkedPaymentUrl(result?.confirmationUrl);
}
export async function cancelCheckoutRenewal() {
  const status=await apiRequest<AppSubscriptionStatusDto>("/api/v1/app-subscription/yookassa/cancel",{
    method:"POST",browserAuth:true,expectedStatus:200,json:{},
  });if(!status||typeof status.hasActiveSubscription!=="boolean")throw Error("Сервер не подтвердил изменение подписки");
  return status;
}
