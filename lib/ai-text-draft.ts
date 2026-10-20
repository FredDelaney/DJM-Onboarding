type DraftStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function aiTextDraftKey(userId:string,workspace:string,context:string){
  return `redream:unsent-capture:v1:${JSON.stringify([userId,workspace,context])}`;
}
export function readAiTextDraft(storage:DraftStorage,key:string,now=Date.now()):string{
  try{
    const item=JSON.parse(storage.getItem(key)||'null');
    if(item?.version===1&&typeof item.text==='string'&&item.text.length<=60000&&Number(item.expiresAt)>now)return item.text;
    storage.removeItem(key);
  }catch{}
  return '';
}
export function writeAiTextDraft(storage:DraftStorage,key:string,text:string,now=Date.now()):boolean{
  try{
    if(!text.trim()){storage.removeItem(key);return true;}
    if(text.length>60000)return false;
    storage.setItem(key,JSON.stringify({version:1,text,expiresAt:now+2*60*60*1000}));return true;
  }catch{return false;}
}
