'use client';
import {Camera,LoaderCircle} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {supabase,publicFile} from '@/lib/supabase';
import {saveProfilePhoto,type PhotoDraft} from '@/lib/profile-photo-write';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {friendlyError} from '@/lib/platform-client';
import styles from './PlayerProfilePhoto.module.css';

type Props={playerId:string;name:string;path?:string|null;canEdit:boolean;blocked?:boolean;className?:string;invoke:(action:string,body?:Record<string,unknown>)=>Promise<any>;onSaved:(path:string)=>void};
export default function PlayerProfilePhoto({playerId,name,path,canEdit,blocked=false,className='',invoke,onSaved}:Props){
 const input=useRef<HTMLInputElement>(null),busyRef=useRef(false),alive=useRef(true),draft=useRef<(PhotoDraft&{file:File;token:string})|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const save=async(file?:File)=>{
  if(busyRef.current||blocked||!canEdit)return;
  if(file){
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Use a JPG, PNG or WebP image.');return;}
   if(!file.size||file.size>8*1024*1024){setError('Use an image smaller than 8 MB.');return;}
   draft.current=null;
  }
  busyRef.current=true;setBusy(true);setError('');setRetry(false);
  try{
   if(!draft.current&&file){
    const response=await readWithDeadline(invoke('player_profile_photo_begin',{player_id:playerId,content_type:file.type,size:file.size}));
    if(!alive.current)return;
    if(!response?.upload?.path||!response.upload.token)throw new Error('Photo upload could not be prepared. Choose the photo again.');
    draft.current={path:response.upload.path,token:response.upload.token,file,uploaded:false};
   }
   const item=draft.current;if(!item)return;
   const outcome=await saveProfilePhoto(item,
    ()=>supabase.storage.from('player-public').uploadToSignedUrl(item.path,item.token,item.file,{contentType:item.file.type}),
    async()=>{if(!alive.current)return {data:null,error:{code:'cancelled'}};try{const result=await invoke('player_profile_photo_attach',{player_id:playerId,path:item.path});return {data:result?.player,error:null};}catch(cause){return {data:null,error:{message:friendlyError(cause)}};}}
   );
   if(!alive.current)return;
   if(outcome.status!=='saved'){setRetry(true);throw new Error(outcome.status==='unknown'?'The photo could not be confirmed. Check and retry the same photo.':'The photo could not be saved. Try again.');}
   onSaved(item.path);draft.current=null;
  }catch(cause){if(alive.current){setError(friendlyError(cause));setRetry(Boolean(draft.current));}}
  finally{busyRef.current=false;if(alive.current)setBusy(false);}
 };
 const url=publicFile('player-public',path);
 const image=url?<img src={url} alt={name}/>:<span className={styles.empty}><Camera size={22}/><small>Add photo</small></span>;
 return <div className={styles.root}>
  {canEdit?<button type="button" className={`${className} ${styles.photo}`} onClick={()=>input.current?.click()} disabled={busy||blocked} aria-label={url?'Change player photo':'Add player photo'}>
   {busy?<LoaderCircle size={22} className={styles.spin}/>:image}{url&&!busy?<span className={styles.change}><Camera size={13}/></span>:null}
  </button>:<div className={`${className} ${styles.photo}`}>{url?image:<span>{name.split(/\s+/).slice(0,2).map(part=>part[0]).join('')}</span>}</div>}
  <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Player photo file" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void save(file);}}/>
  {error?<p className={styles.error} role="alert">{error}{retry?<button type="button" onClick={()=>void save()} disabled={busy}>Retry photo</button>:null}</p>:null}
 </div>;
}
