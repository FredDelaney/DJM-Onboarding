export type ContactDetails={email:string|null;whatsapp:string|null;can_edit?:boolean};
export type ContactDraft={email:string;whatsapp:string};
const clean=(value:unknown)=>String(value??'').trim();
const emailPattern=/^[A-Za-z0-9.!#$%&'*+/=^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
export function normaliseContact(value:{email:unknown;whatsapp:unknown}):ContactDetails {
 const email=clean(value.email),raw=clean(value.whatsapp);
 if(email&&(email.length>254||!emailPattern.test(email)))throw new Error('Enter a valid email address.');
 if(raw&&!/^(\+|00)[0-9 ().-]+$/.test(raw))throw new Error('Include the WhatsApp country code, for example +39.');
 const whatsapp=raw.replace(/^00/,'+').replace(/[ ().-]/g,'');
 if(whatsapp&&!/^\+[1-9][0-9]{7,14}$/.test(whatsapp))throw new Error('Use a complete WhatsApp number with its country code.');
 return {email:email||null,whatsapp:whatsapp||null};
}
export function contactLinks(value:{email:unknown;whatsapp:unknown}) {
 const rawEmail=clean(value.email),rawPhone=clean(value.whatsapp);
 let whatsapp:string|null=null;
 try {const v=normaliseContact({email:null,whatsapp:rawPhone});if(v.whatsapp)whatsapp='https://wa.me/'+v.whatsapp.slice(1);}catch{}
 return {email:emailPattern.test(rawEmail)&&rawEmail.length<=254?'mailto:'+encodeURIComponent(rawEmail).replace(/%40/g,'@'):null,whatsapp};
}
export function contactPatch(before:ContactDetails,draft:ContactDraft) {
 const next=normaliseContact(draft),patch:Partial<ContactDetails>={},expected:Partial<ContactDetails>={};
 for(const key of ['email','whatsapp'] as const){
  // Existing saved international numbers can contain spaces without needing a rewrite.
  let previous=before[key]||null;
  if(key==='whatsapp'&&previous){try{previous=normaliseContact({email:null,whatsapp:previous}).whatsapp;}catch{}}
  if(next[key]!==previous){patch[key]=next[key];expected[key]=before[key]??null;}
 }
 return {patch,expected};
}
