type Invoke=<T=any>(action:string,body?:Record<string,unknown>)=>Promise<T>;
type CacheEntry={profile:any;expiresAt:number};
const profileCache=new Map<string,CacheEntry>();
const profileRequests=new Map<string,Promise<any>>();
const revisions=new Map<string,number>();
const TTL_MS = 60_000;
const keyFor=(playerId:string,scope:string)=>JSON.stringify([scope,playerId]);
const write=(key:string,profile:any)=>profileCache.set(key,{profile,expiresAt:Date.now()+TTL_MS});
export const getCachedPlayerProfile=(playerId:string,scope='')=>{
 if(!scope)return null;
 const key=keyFor(playerId,scope),entry=profileCache.get(key);
 if(!entry)return null;
 if(entry.expiresAt<Date.now()){profileCache.delete(key);return null;}
 return entry.profile;
};
export const setCachedPlayerProfile=(playerId:string,profile:any,scope='')=>{
 if(!scope||!playerId||!profile)return;
 const key=keyFor(playerId,scope);
 revisions.set(key,(revisions.get(key)||0)+1);
 profileRequests.delete(key);write(key,profile);
};
export const prefetchPlayerProfile=(playerId:string,invoke:Invoke,scope='')=>{
 if(!scope)return invoke<any>('player_profile_core',{player_id:playerId}).then(response=>response?.profile||null);
 const cached=getCachedPlayerProfile(playerId,scope);
 if(cached)return Promise.resolve(cached);
 const key=keyFor(playerId,scope),pending=profileRequests.get(key);
 if(pending)return pending;
 const revision=revisions.get(key)||0;
 const request=invoke<any>('player_profile_core',{player_id:playerId})
 .then(response=>{
  const profile=response?.profile||null;
  if(profile&&(revisions.get(key)||0)===revision)write(key,profile);
  return profile;
 }).finally(()=>{if(profileRequests.get(key)===request)profileRequests.delete(key);});
 profileRequests.set(key,request);return request;
};
export const invalidatePlayerProfile=(playerId:string,scope='')=>{
 const keys=scope?[keyFor(playerId,scope)]:[...new Set([...profileCache.keys(),...profileRequests.keys()])].filter(key=>JSON.parse(key)[1]===playerId);
 for(const key of keys){revisions.set(key,(revisions.get(key)||0)+1);profileCache.delete(key);profileRequests.delete(key);}
};
