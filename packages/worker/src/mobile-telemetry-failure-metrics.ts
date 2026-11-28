import { mobileDiagnosticCatalog, type MobileTelemetryEventV1 } from '@gafus/types';

export const mobileFailureDomains = ['startup','native','auth','training','ota','chat2','feed','billing','media','walk','pets','qa','other'] as const;
type Domain = typeof mobileFailureDomains[number];
const knownCodes = new Set<string>(Object.values(mobileDiagnosticCatalog).map(source=>source.code));

/** Map only to a small fixed set of metric labels. Never expose arbitrary
 * error codes, release IDs or installation/session IDs as Prometheus labels. */
export function mobileFailureDomain(event: MobileTelemetryEventV1): Domain {
  if(event.kind==='startup_failure') return 'startup';
  if(event.kind==='native_crash'||event.kind==='native_exit'||event.kind==='native_hang'||event.kind==='anr'||event.kind==='oom') return 'native';
  const code=event.errorCode&&knownCodes.has(event.errorCode)?event.errorCode:'';
  const module=event.module??'';
  if(/^(APP_BOOTSTRAP|SPLASH_SCREEN|FONT_LOAD|NATIVE_CRASH_CAPTURE)/.test(code))return 'startup';
  if(/^(OTA|REQUIRED_OTA|MOBILE_OTA)/.test(code)||module==='OTA')return 'ota';
  if(/^(AUTH|LOGIN|REGISTER|PASSWORD|SESSION_RESTORE)/.test(code)||module==='AUTH')return 'auth';
  if(/^(TRAINING|COURSE|ACCORDION_STEP)/.test(code)||module==='TRAINING'||module==='COURSES')return 'training';
  if(module==='CHAT2'||/^CHAT2/.test(code))return 'chat2';
  if(module==='FEED'||/^(FEED|MOMENTS)/.test(code))return 'feed';
  if(module==='APP_SUBSCRIPTION'||module==='BILLING'||/^(PAYMENT|PURCHASE|SUBSCRIPTION|PROMO)/.test(code))return 'billing';
  if(module==='GALLERY'||/^(CDN|IMAGE|VIDEO|PHOTO|GALLERY)/.test(code))return 'media';
  if(module==='WALK'||/^(GPS|WALK|DOG_WALK)/.test(code))return 'walk';
  if(module==='PETS'||/^(PET|VET)/.test(code))return 'pets';
  if(module==='QUESTIONS'||module==='QA'||/^QUESTION/.test(code))return 'qa';
  return 'other';
}

export function createMobileFailureMetrics() {
  const counts=new Map<string,number>();
  return {
    add(environment:'preview'|'production',event:MobileTelemetryEventV1) {
      if((event.platform!=='ios'&&event.platform!=='android')||(event.severity!=='ERROR'&&event.severity!=='FATAL'))return;
      const key=[environment,event.platform,mobileFailureDomain(event)].join('|');
      counts.set(key,(counts.get(key)??0)+(event.occurrences??1));
    },
    render(environment:string):string[] {
      const metric='gafus_mobile_diagnostic_failure_occurrences_total';
      const lines=['# HELP '+metric+' Exported application error occurrences by fixed diagnostic domain','# TYPE '+metric+' counter'];
      if(environment!=='preview'&&environment!=='production')return lines;
      for(const platform of ['ios','android'])for(const domain of mobileFailureDomains) {
        const key=[environment,platform,domain].join('|');
        lines.push(metric+`{environment="${environment}",platform="${platform}",domain="${domain}"} ${counts.get(key)??0}`);
      }
      return lines;
    },
  };
}
