'use client';

import {Shield} from 'lucide-react';
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

export default function ClubIdentityMark({name,large=false}:{name:string;large?:boolean}) {
  const initials=(name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join(''))||'FC';
  return <span className={large?styles.large:styles.mark} data-tone={colour(name)} aria-hidden="true">
    <span className={styles.inside}><Shield size={large?37:25} strokeWidth={1.5}/><strong>{initials}</strong></span>
  </span>;
}
