'use client';

import {Shield} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import styles from './ClubIdentityMark.module.css';

const regions:Record<string,string>={
  'Albania':'AL','Algeria':'DZ','Argentina':'AR','Armenia':'AM','Australia':'AU','Austria':'AT',
  'Azerbaijan':'AZ','Belgium':'BE','Bolivia':'BO','Bosnia and Herzegovina':'BA','Brazil':'BR',
  'Bulgaria':'BG','Cameroon':'CM','Canada':'CA','Chile':'CL','China':'CN','Colombia':'CO',
  'Costa Rica':'CR','Croatia':'HR','Cyprus':'CY','Czech Republic':'CZ','Czechia':'CZ',
  'Denmark':'DK','Ecuador':'EC','Egypt':'EG','England':'GB-ENG','Estonia':'EE','Finland':'FI',
  'France':'FR','Georgia':'GE','Germany':'DE','Ghana':'GH','Gibraltar':'GI','Greece':'GR',
  'Hungary':'HU','Iceland':'IS','India':'IN','Indonesia':'ID','Iran':'IR','Iraq':'IQ',
  'Ireland':'IE','Israel':'IL','Italy':'IT','Ivory Coast':'CI',"Côte d'Ivoire":'CI',
  'Japan':'JP','Kazakhstan':'KZ','Kenya':'KE','Kosovo':'XK','Latvia':'LV','Lithuania':'LT',
  'Luxembourg':'LU','Malaysia':'MY','Malta':'MT','Mexico':'MX','Moldova':'MD',
  'Montenegro':'ME','Morocco':'MA','Netherlands':'NL','New Zealand':'NZ','Nigeria':'NG',
  'North Macedonia':'MK','Northern Ireland':'GB-NIR','Norway':'NO','Pakistan':'PK','Panama':'PA',
  'Paraguay':'PY','Peru':'PE','Philippines':'PH','Poland':'PL','Portugal':'PT','Qatar':'QA',
  'Romania':'RO','Russia':'RU','Saudi Arabia':'SA','Scotland':'GB-SCT','Senegal':'SN',
  'Serbia':'RS','Singapore':'SG','Slovakia':'SK','Slovenia':'SI','South Africa':'ZA',
  'South Korea':'KR','Korea Republic':'KR','Spain':'ES','Sweden':'SE','Switzerland':'CH',
  'Thailand':'TH','Tunisia':'TN','Turkey':'TR','Türkiye':'TR','Ukraine':'UA',
  'United Arab Emirates':'AE','United States':'US','USA':'US','Uruguay':'UY',
  'Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN','Wales':'GB-WLS',
};
// Unicode subdivision flags display as the correct home-nation flags where supported.
const subdivisionFlag=(name:string)=>'🏴'+[...'gb'+name].map(x=>String.fromCodePoint(0xE0000+x.charCodeAt(0))).join('')+String.fromCodePoint(0xE007F);
const homeNations:Record<string,string>={'GB-ENG':subdivisionFlag('eng'),'GB-SCT':subdivisionFlag('sct'),'GB-NIR':'🇬🇧','GB-WLS':subdivisionFlag('wls')};

export function CountryFlag({country}:{country?:string|null}) {
  const raw=(country||'').trim();
  const code=regions[raw]||(/^[A-Z]{2}$/.test(raw)?raw:undefined);
  const flag=code?(homeNations[code]||String.fromCodePoint(...code.split('').map(c=>127397+c.charCodeAt(0)))):'🌐';
  return <span className={styles.flag} aria-hidden="true">{flag}</span>;
}

function colour(name:string) {
  let hash=7;
  for(const c of name)hash=((hash*31)+c.charCodeAt(0))>>>0;
  return (hash%5===0?'slate':hash%5===1?'blue':hash%5===2?'teal':hash%5===3?'indigo':'amber');
}

type Crest={url:string;creditUrl:string;source:'Wikimedia Commons';licence:string}|null;
const crestCache=new Map<string,Promise<Crest>>();
function fetchCrest(name:string,country:string):Promise<Crest>{
  const key=(name+'|'+country).toLowerCase();
  if(!crestCache.has(key)){
    const params=new URLSearchParams({name,country});
    crestCache.set(key,fetch('/api/club-crest?'+params.toString())
      .then(async response=>response.ok?(await response.json()).crest as Crest:null)
      .catch(()=>null));
  }
  return crestCache.get(key)!;
}
export default function ClubIdentityMark({name,country,large=false}:{name:string;country?:string|null;large?:boolean}) {
  const [visible,setVisible]=useState(false);
  const [crest,setCrest]=useState<Crest>(null);
  const [imageReady,setImageReady]=useState(false);
  const [imageError,setImageError]=useState(false);
  const holder=useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    const node=holder.current;
    if(!node)return;
    if(!('IntersectionObserver' in window)){setVisible(true);return;}
    const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setVisible(true);observer.disconnect();}},{rootMargin:'180px'});
    observer.observe(node);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!visible)return;
    let mounted=true;
    setImageError(false);
    setImageReady(false);
    setCrest(null);
    void fetchCrest(name,country||'').then(result=>{if(mounted)setCrest(result);});
    return ()=>{mounted=false;};
  },[visible,name,country]);
  const initials=(name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join(''))||'FC';
  return <span ref={holder} className={large?styles.large:styles.mark} data-tone={colour(name)} aria-hidden="true" title={crest?.creditUrl?'Club image: Wikimedia Commons ('+crest.licence+')':'Club identity'}>
    <span className={styles.inside} style={imageReady?{visibility:'hidden'}:undefined}><Shield size={large?37:25} strokeWidth={1.5}/><strong>{initials}</strong></span>
    {crest&&!imageError&&<img className={styles.logo} src={crest.url} alt="" loading="lazy" onLoad={()=>setImageReady(true)} onError={()=>{setImageReady(false);setImageError(true);}}/>}
  </span>;
}
