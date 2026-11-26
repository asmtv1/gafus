// Loaded only for an explicitly consented QA capture. No plaintext fallback.
const keyName = (id:string) => "gafus.walk.qa." + id;
async function native() {
  const [crypto,secure] = await Promise.all([import("expo-crypto"),import("expo-secure-store")]);
  if (typeof crypto.aesEncryptAsync !== "function" || typeof crypto.AESEncryptionKey?.generate !== "function" ||
      !(await secure.isAvailableAsync())) throw new Error("WALK_QA_CRYPTO_UNAVAILABLE");
  return {crypto,secure};
}
const options = (secure:typeof import("expo-secure-store")) => ({
  keychainAccessible:secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
});
export async function createQaKey(id:string):Promise<void> {
  const {crypto,secure}=await native();
  const key=await crypto.AESEncryptionKey.generate();
  await secure.setItemAsync(keyName(id),await key.encoded("base64"),options(secure));
}
export async function deleteQaKey(id:string):Promise<void> {
  const secure=await import("expo-secure-store");
  await secure.deleteItemAsync(keyName(id),options(secure));
}
async function readKey(id:string) {
  const {crypto,secure}=await native();
  const encoded=await secure.getItemAsync(keyName(id),options(secure));
  if(!encoded) throw new Error("WALK_QA_KEY_UNAVAILABLE");
  return {crypto,key:await crypto.AESEncryptionKey.import(encoded,"base64")};
}
// JSON coordinates, times and enum names are ASCII. Escape other text before encoding.
const bytes=(s:string)=>Uint8Array.from(s.replace(/[^\x00-\x7f]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0")),c=>c.charCodeAt(0));
export async function sealQaBatch(id:string,aad:string,value:unknown):Promise<string> {
  const {crypto,key}=await readKey(id);
  const sealed=await crypto.aesEncryptAsync(bytes(JSON.stringify(value)),key,{additionalData:bytes(aad)});
  return sealed.combined("base64");
}
export async function openQaBatch(id:string,aad:string,encoded:string):Promise<unknown> {
  const {crypto,key}=await readKey(id);
  const plaintext=await crypto.aesDecryptAsync(crypto.AESSealedData.fromCombined(encoded),key,{additionalData:bytes(aad)});
  let json="";
  for(let i=0;i<plaintext.length;i+=4096) json+=String.fromCharCode(...plaintext.subarray(i,i+4096));
  return JSON.parse(json);
}
