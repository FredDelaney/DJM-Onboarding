import {NextRequest,NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

type Crest={url:string;creditUrl:string;source:'Wikimedia Commons';licence:string}|null;
type WikidataSearch={search?:Array<{id:string;label:string;description?:string}>};
type WikidataEntities={entities?:Record<string,{claims?:Record<string,Array<{mainsnak?:{datavalue?:{value?:unknown}}}>>}>};
type Commons={query?:{pages?:Record<string,{imageinfo?:Array<{thumburl?:string;url?:string;descriptionurl?:string;extmetadata?:Record<string,{value?:string}>}>}>}};
const headers={'User-Agent':'ReDreamSystemsClubLogo/1.0 (https://redreamsystems.com)','Accept':'application/json'};
const norm=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+(?:football club|f c|fc)$/,'').trim();
const respond=(crest:Crest)=>NextResponse.json({crest},{headers:{'Cache-Control':'public, s-maxage=604800, stale-while-revalidate=86400'}});
async function readJSON<T>(url:URL):Promise<T>{
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(5500),next:{revalidate:604800}});
 if(!response.ok)throw new Error('provider_unavailable');
 return await response.json() as T;
}
const safeImage=(url:string)=>{try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='upload.wikimedia.org'||u.hostname==='thumb.wikimedia.org');}catch{return false;}};

export async function GET(request:NextRequest){
 const name=(request.nextUrl.searchParams.get('name')||'').trim().slice(0,90);
 const country=(request.nextUrl.searchParams.get('country')||'').trim().slice(0,60);
 if(name.length<3||!(/^[\p{L}\p{N} .,'’()\-]+$/u.test(name)))return respond(null);
 try{
  const key=norm(name)+'|'+country.toLowerCase();
  // Manually verified Commons files for clubs whose Wikidata logo claim is absent.
  // Still check the live Commons file licence before returning any image.
  const known:Record<string,string>={
    'manchester city|england':'Manchetsr city.png',
    'auckland|new zealand':'Auckland FC logo.svg',
    'auckland united|new zealand':'Auckland United FC Logo.svg',
  };
  let file:string|undefined=known[key];
  if(!file){
    const search=new URL('https://www.wikidata.org/w/api.php');
    for(const [k,v] of Object.entries({action:'wbsearchentities',search:name,language:'en',type:'item',limit:'6',format:'json'}))search.searchParams.set(k,v);
    const results=await readJSON<WikidataSearch>(search);
    const requested=norm(name);
    const candidate=(results.search||[]).find(x=>norm(x.label)===requested && /football|soccer|futbol|fußball/i.test(x.description||'') && !/national team/i.test(x.description||'') && (!country || (x.description||'').toLowerCase().includes(country.toLowerCase())));
    if(!candidate)return respond(null);
    const wd=new URL('https://www.wikidata.org/w/api.php');
    for(const [k,v] of Object.entries({action:'wbgetentities',ids:candidate.id,props:'claims',format:'json'}))wd.searchParams.set(k,v);
    const entity=await readJSON<WikidataEntities>(wd);
    const claim=entity.entities?.[candidate.id]?.claims?.P154?.find(x=>typeof x.mainsnak?.datavalue?.value==='string')?.mainsnak?.datavalue?.value;
    if(typeof claim==='string')file=claim;
  }
  if(!file||file.length>200)return respond(null);
  const commons=new URL('https://commons.wikimedia.org/w/api.php');
  for(const [k,v] of Object.entries({action:'query',titles:'File:'+file,prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'160',format:'json'}))commons.searchParams.set(k,v);
  const result=await readJSON<Commons>(commons);
  const info=Object.values(result.query?.pages||{})[0]?.imageinfo?.[0];
  const licence=info?.extmetadata?.LicenseShortName?.value||'';
  const allowed=['CC0','Public domain','PD'].some(x=>licence.toLowerCase().startsWith(x.toLowerCase()));
  const url=info?.thumburl||info?.url||'';
  const credit=info?.descriptionurl||'';
  if(!allowed||!safeImage(url)||!credit.startsWith('https://commons.wikimedia.org/wiki/File:'))return respond(null);
  return respond({url,creditUrl:credit,source:'Wikimedia Commons',licence});
 }catch{return respond(null);}
}
