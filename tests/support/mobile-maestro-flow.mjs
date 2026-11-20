/** Static Maestro YAML contract only. Does NOT imply native execution or approval. */
import {parseAllDocuments} from 'yaml';
export function inspectMaestroFlow(content,{kind,appId='ru.gafus.app'}={}) {
  if(!['login','android-ota','ios-ota'].includes(kind))throw Error('MAESTRO_UNKNOWN_FLOW_KIND');
  const docs=parseAllDocuments(content,{uniqueKeys:true});
  if(docs.length!==2 || docs.some(d=>d.errors.length))throw Error('MAESTRO_YAML_SYNTAX_OR_DOCUMENT_COUNT_INVALID');
  const head=docs[0].toJS(),actions=docs[1].toJS();
  if(!head||head.appId!==appId||typeof head.name!=='string'||!head.name.trim()||!Array.isArray(actions)||actions.length<3)
    throw Error('MAESTRO_YAML_HEADER_OR_ACTIONS_INVALID');
  const normalized=actions.map(x=>typeof x==='string'?{[x]:null}:x);
  const recognized=new Set(['launchApp','stopApp','tapOn','inputText','assertVisible','pressKey']);
  for(const action of normalized){
    const entries=action&&typeof action==='object'&&!Array.isArray(action)?Object.entries(action):[];
    if(entries.length!==1||!recognized.has(entries[0][0]))throw Error('MAESTRO_YAML_UNKNOWN_OR_INVALID_ACTION');
  }
  const count=(command)=>normalized.filter(x=>Object.hasOwn(x,command)).length;
  const hasTestId=(id)=>normalized.some(x=>x.tapOn?.id===id||x.assertVisible?.id===id);
  if(kind==='login'){
    if(count('launchApp')<2||count('stopApp')!==1||
       !hasTestId('username-input')||!hasTestId('password-input')||!hasTestId('login-button')||
       !normalized.some(x=>x.inputText==='${QA_USERNAME}')||!normalized.some(x=>x.inputText==='${QA_PASSWORD}')||
       !normalized.some(x=>x.assertVisible==='Курсы'))throw Error('MAESTRO_LOGIN_FLOW_INCOMPLETE');
  } else {
    if(count('launchApp')<2 || count('stopApp')!==1 ||
       normalized.filter(x=>x.assertVisible?.id==='required-ota-screen').length<2)throw Error('MAESTRO_MANDATORY_OTA_FLOW_INCOMPLETE');
    if(kind==='android-ota'&&!normalized.some(x=>x.pressKey==='back'))throw Error('MAESTRO_ANDROID_BACK_ESCAPE_UNCHECKED');
    if(kind==='ios-ota'&&count('pressKey')>0)throw Error('MAESTRO_IOS_UNEXPECTED_ANDROID_BACK');
  }
  return {kind,appId:head.appId,actionCount:actions.length,commands:normalized.map(x=>Object.keys(x)[0]),staticOnly:true};
}
