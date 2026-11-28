import * as Crypto from "expo-crypto";
import { mobileHttpEndpointGroups, type MobileHttpDiagnostic } from '@gafus/types';

/** Fresh correlation link for every physical HTTP attempt. The API does not
 * trust it as a parent; it creates a server span linked to this context. */
export function newMobileTraceparent():string|undefined {
  try {
    const trace=Crypto.randomUUID().replace(/-/g,'');
    const span=Crypto.randomUUID().replace(/-/g,'').slice(0,16);
    if(/^[a-f0-9]{32}$/.test(trace)&&/^[a-f0-9]{16}$/.test(span))return '00-'+trace+'-'+span+'-00';
  }catch{ /* diagnostic: expected Diagnostic enrichment must never prevent an application request. */ /* optional diagnostics must never prevent a request */}
}
export function mobileEndpointGroup(endpoint:string):MobileHttpDiagnostic["endpointGroup"] {
  const first=/^\/api\/v1\/([a-z0-9-]+)(?:[/?]|$)/.exec(endpoint)?.[1];
  const candidate=first?.replace(/-/g,"_").toUpperCase();
  return mobileHttpEndpointGroups.find(group=>group===candidate)??"OTHER";
}

export function buildMobileHttpDiagnostic(input:{
  endpoint:string;method:MobileHttpDiagnostic['method'];category:MobileHttpDiagnostic['category'];
  startedAt:number;retried:boolean;response?:Response;clientTraceparent?:string;
}):MobileHttpDiagnostic {
  // Only fixed first route segments; IDs, query params, response contents and
  // arbitrary server codes never enter the diagnostic context.
  const endpointGroup=mobileEndpointGroup(input.endpoint);
  const id=input.response?.headers?.get?.('X-Trace-Id');
  const status=input.response?.status;
  return {method:input.method,endpointGroup,category:input.category,
    durationMs:Math.min(300_000,Math.max(0,Math.round(Date.now()-input.startedAt))),
    retryCount:input.retried?1:0,
    ...(input.clientTraceparent?{clientTraceparent:input.clientTraceparent}:{}),
    ...(typeof status==='number'&&status>=100&&status<=599?{status}:{}),
    ...(id&&/^[a-f0-9]{32}$/i.test(id)&&!/^0+$/.test(id)?{serverTraceId:id.toLowerCase()}:{}),
  };
}
