'use client';
import {Mail,MessageCircle,LoaderCircle,Pencil,Check,X} from 'lucide-react';
import {useCallback,useEffect,useRef,useState} from 'react';
import {contactLinks,contactPatch,type ContactDetails,type ContactDraft} from '@/lib/record-contact-details';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {friendlyError} from '@/lib/platform-client';
import styles from './RecordContactActions.module.css';

type Rpc=<T=any>(name:string,args?:Record<string,unknown>)=>Promise<T>;
type Props={kind:'player'|'recruitment_target'|'contact';recordId:string;name:string;scope?:string;rpc:Rpc;blocked?:boolean;refreshKey?:string;onSaved?:(details:ContactDetails)=>void|Promise<void>};
export default function RecordContactActions(props:Props){
 return <ContactActions key={`${props.scope||''}:${props.kind}:${props.recordId}`} {...props}/>;
}
function ContactActions({kind,recordId,name,rpc,blocked=false,refreshKey='',onSaved}:Props){
 const [saved,setSaved]=useState<ContactDetails|null>(null),[draft,setDraft]=useState<ContactDraft>({email:'',whatsapp:''});
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const alive=useRef(true),request=useRef(0),mutation=useRef(false),input=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const baseline=useRef(saved);baseline.current=saved;
 const read=useCallback(async(preserve=false)=>{
  const before=baseline.current;
  const generation=++request.current;setLoading(true);setError('');
  try{
   const next=await readWithDeadline(rpc<ContactDetails>('redream_record_contact_details_v1',{p_kind:kind,p_record_id:recordId}));
   if(!alive.current||generation!==request.current)return;
   setSaved(next);setDraft(current=>({email:preserve&&current.email!==(before?.email||'')?current.email:next.email||'',whatsapp:preserve&&current.whatsapp!==(before?.whatsapp||'')?current.whatsapp:next.whatsapp||''}));
   if(preserve)setNotice('Latest details loaded. Review your changes before saving.');
  }catch(cause){if(alive.current&&generation===request.current)setError(friendlyError(cause));}
  finally{if(alive.current&&generation===request.current)setLoading(false);}
 },[rpc,kind,recordId]);
 useEffect(()=>{alive.current=true;void read();return()=>{alive.current=false;request.current++;};},[read,refreshKey]);
 const hadOpen=useRef(false);
 useEffect(()=>{if(open){hadOpen.current=true;if(!busy)input.current?.focus();}else if(hadOpen.current&&!busy){trigger.current?.focus();hadOpen.current=false;}},[open,busy]);
 const edit=()=>{setNotice('');setError('');setOpen(true);};
 const close=()=>{if(mutation.current)return;setOpen(false);trigger.current?.focus();};
 const links=contactLinks(saved||{email:null,whatsapp:null});
 const dirty=Boolean(saved&&(draft.email!==(saved.email||'')||draft.whatsapp!==(saved.whatsapp||'')));
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(mutation.current||!saved||blocked)return;
  let change;try{change=contactPatch(saved,draft);}catch(cause){setError(friendlyError(cause));return;}
  if(!Object.keys(change.patch).length){close();return;}
  mutation.current=true;setBusy(true);setError('');setNotice('');
  try{
   const next=await readWithDeadline(rpc<ContactDetails>('redream_record_contact_details_v1',{p_kind:kind,p_record_id:recordId,p_patch:change.patch,p_expected:change.expected}));
   if(!alive.current)return;
   setSaved(next);setDraft({email:next.email||'',whatsapp:next.whatsapp||''});setOpen(false);setNotice('Contact details saved.');trigger.current?.focus();
   try{await onSaved?.(next);}catch{if(alive.current)setNotice('Contact details saved. Refresh the record to update its other details.');}
  }catch(cause){if(alive.current)setError(friendlyError(cause));}
  finally{mutation.current=false;if(alive.current)setBusy(false);}
 };
 return <section className={styles.root} aria-label={`Contact details for ${name}`}>
  <div className={styles.actions}>
   {links.whatsapp?<a className={styles.whatsapp} href={links.whatsapp} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${name}`} title="WhatsApp"><MessageCircle size={19}/><span>WhatsApp</span></a>:<button className={styles.whatsapp} type="button" onClick={edit} disabled={loading||blocked||!saved?.can_edit} aria-label={`Add WhatsApp for ${name}`}><MessageCircle size={19}/><span>WhatsApp</span><i>+</i></button>}
   {links.email?<a className={styles.email} href={links.email} aria-label={`Email ${name}`} title="Email"><Mail size={19}/><span>Email</span></a>:<button className={styles.email} type="button" onClick={edit} disabled={loading||blocked||!saved?.can_edit} aria-label={`Add email for ${name}`}><Mail size={19}/><span>Email</span><i>+</i></button>}
   <button ref={trigger} type="button" className={styles.edit} onClick={open?close:edit} disabled={loading||blocked||busy||!saved?.can_edit} aria-expanded={open} aria-label={`Edit contact details for ${name}`} title="Edit contact details"><Pencil size={15}/></button>
   {loading?<LoaderCircle size={15} className={styles.spin} aria-label="Loading contact details"/>:null}
  </div>
  {error?<div className={styles.error} role="alert">{error}<button type="button" onClick={()=>void read(open)} disabled={busy||loading}>Load latest details</button></div>:null}
  {notice?<p className={styles.notice} role="status">{notice}</p>:null}
  {open?<form className={styles.form} onSubmit={save} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}}>
   <label>WhatsApp<input ref={input} type="tel" inputMode="tel" autoComplete="tel" placeholder="+39 333 123 4567" value={draft.whatsapp} onChange={e=>setDraft({...draft,whatsapp:e.target.value})} disabled={busy}/></label>
   <label>Email<input type="email" autoComplete="email" placeholder="name@example.com" value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})} disabled={busy}/></label>
   <div className={styles.footer}><button type="button" onClick={close} disabled={busy}><X size={14}/>Cancel</button><button type="submit" disabled={busy||blocked||!dirty}>{busy?<LoaderCircle size={14} className={styles.spin}/>:<Check size={14}/>}Save details</button></div>
  </form>:null}
 </section>;
}
