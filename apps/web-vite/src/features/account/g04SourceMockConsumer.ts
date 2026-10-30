/**
 * W1 G04 legacy-shaped SOURCE/MOCK ONLY.
 * Hono static endpoint shapes: POST /api/v1/user/account/deletion-code {}
 * and POST /api/v1/user/account/delete {code}; both reply {success:true}
 * with 200. No HTTP transport, fetch, API import or real DELETE.
 * An external fixture injector is mandatory. Approval for actual deletion
 * requires a separate AG4 irreversible-operation gate.
 */
export const G04_MOCK_ENDPOINTS = Object.freeze({
  requestCode:"/api/v1/user/account/deletion-code",
  deleteAccount:"/api/v1/user/account/delete",
} as const);
export type G04Operation = "requestCode"|"deleteAccount";
export type G04FixtureWire = (request:Readonly<{
  operation:G04Operation;
  path:string;
  method:"POST";
  json:Readonly<Record<string,never>> | Readonly<{code:string}>;
  ownerId:string;
}>)=>Promise<Readonly<{status:number;body:unknown}>>;
export type G04Verdict = Readonly<{
  kind:"accepted"|"rejected"|"unknown";
  message:string;
}>;
export type G04SourceMockConsumer = Readonly<{
  requestCode:(ownerId:string)=>Promise<G04Verdict>;
  deleteAccount:(ownerId:string,code:string)=>Promise<G04Verdict>;
}>;
const unknown: G04Verdict=Object.freeze({
  kind:"unknown",message:"Результат запроса не подтверждён. Не повторяйте действие автоматически.",
});
const rejected=(message:string):G04Verdict=>({kind:"rejected",message});
function classify(operation:G04Operation,reply:Readonly<{status:number;body:unknown}>):G04Verdict {
  const validObject=!!reply.body&&typeof reply.body==="object"&&
    !Array.isArray(reply.body);
  const body=validObject?reply.body as Record<string,unknown>:null;
  if(reply.status===200&&body?.success===true){
    return {kind:"accepted",message:operation==="requestCode"?
      "Запрос кода принят (синтетический mock).":"Синтетическое подтверждение удаления. Реальный аккаунт не изменён."};
  }
  // Any unexpected 2xx, 5xx, 429 or network error may have lost a
  // committed ACK; NEVER conclude that the destructive action was skipped.
  if(reply.status===400)return rejected("Проверьте код и попробуйте ещё раз вручную.");
  if(reply.status===401)return rejected("Код недействителен либо сессия завершена.");
  if(reply.status===403)return rejected("Недостаточно прав для действия.");
  if(reply.status===409)return rejected("Конфликт состояния аккаунта. Проверьте данные.");
  if(reply.status===429&&operation==="requestCode")
    return rejected("Слишком много запросов. Повторное действие — только вручную позднее.");
  return unknown;
}
async function safeCall(
  fixture:G04FixtureWire,operation:G04Operation,ownerId:string,
  json:Readonly<Record<string,never>>|Readonly<{code:string}>,
):Promise<G04Verdict> {
  if(!ownerId||ownerId.length>128)return rejected("Требуется вход в аккаунт.");
  try {
    const reply=await fixture(Object.freeze({
      operation,path:G04_MOCK_ENDPOINTS[operation],method:"POST",
      json:Object.freeze({...json}),ownerId,
    }));
    if(!reply||!Number.isInteger(reply.status))return unknown;
    return classify(operation,reply);
  } catch {
    return unknown;
  }
}
export function createG04SourceMockConsumer(fixture:G04FixtureWire):G04SourceMockConsumer {
  return Object.freeze({
    requestCode:(ownerId:string)=>safeCall(fixture,"requestCode",ownerId,{}),
    deleteAccount:(ownerId:string,code:string)=>/^[0-9]{6}$/.test(code)
      ?safeCall(fixture,"deleteAccount",ownerId,{code})
      :Promise.resolve(rejected("Введите шесть цифр кода.")),
  });
}
