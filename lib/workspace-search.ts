export type SearchSource='players'|'recruitment'|'network'|'opportunities'|'deals';
export type SearchItem={key:string;id:string;kind:'player'|'recruitment'|'club'|'contact'|'opportunity'|'deal';title:string;subtitle:string;href:string};
const list=(value:any):any[]=>Array.isArray(value)?value:[];
const text=(value:any)=>typeof value==='string'?value.trim():'';
const context=(...values:any[])=>values.map(text).filter(Boolean).join(' · ');
export const normaliseSearch=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function buildSearchItems(source:SearchSource,data:any,basePath:string):SearchItem[]{
 const base=/^\/workspace\/[a-z0-9%_-]+$/i.test(basePath)?basePath:'/agency';
 const items:SearchItem[]=[];
 const add=(kind:SearchItem['kind'],id:any,title:any,subtitle:string,params:Record<string,string>)=>{
  const record=text(id);if(!record)return;
  items.push({key:kind+':'+record,id:record,kind,title:text(title)||'Name not recorded',subtitle,href:base+'?'+new URLSearchParams(params)});
 };
 if(source==='players')for(const row of list(data?.items)){
  const p=row?.identity||{};
  add('player',row?.player_id,p.name,context(p.current_club,p.primary_position,p.current_country),{view:'players',player:text(row?.player_id),profile:'1'});
 }
 if(source==='recruitment')for(const row of list(data?.items)){
  add('recruitment',row?.id,row?.full_name,context(row?.current_club,row?.primary_position,row?.current_country),{view:'players',tab:'recruitment',target:text(row?.id)});
 }
 if(source==='network'){
  for(const row of list(data?.accounts?.clubs))add('club',row?.organisation_id,row?.name,context(row?.country,row?.league_name),{view:'network',club:text(row?.organisation_id)});
  for(const row of list(data?.contacts?.items)){
   const id=text(row?.person_id)||text(row?.id);
   add('contact',id,row?.person?.full_name||row?.person?.preferred_name,context(row?.employment?.organisation_name,row?.employment?.role_title),{view:'network',person:id});
  }
 }
 if(source==='opportunities')for(const row of list(data?.demand?.items))add('opportunity',row?.club_need_id,row?.need?.title||row?.need?.position,context(row?.club?.name,row?.need?.position),{view:'opportunities',tab:'needs',record:text(row?.club_need_id)});
 if(source==='deals')for(const row of list(data?.portfolio?.deals))add('deal',row?.deal_room_id,row?.title,context(row?.organisation,row?.stage),{view:'opportunities',tab:'deals',record:text(row?.deal_room_id)});
 return [...new Map(items.map(item=>[item.key,item])).values()];
}
export function filterArchivedSearchItems(items:SearchItem[],archives:any[]):SearchItem[]{
 const types={player:'player',recruitment:'recruitment_target',club:'club',contact:'club_contact',opportunity:'club_need',deal:'deal_room'};
 const hidden=new Set(list(archives).map(row=>text(row?.entity_type)+':'+text(row?.entity_id)));
 return items.filter(item=>!hidden.has(types[item.kind]+':'+item.id));
}
export function searchWorkspaceItems(items:SearchItem[],query:string,limit=30):SearchItem[]{
 const q=normaliseSearch(query),tokens=q.split(/\s+/).filter(Boolean);
 const ranked=items.map((item,index)=>{
  const title=normaliseSearch(item.title),all=normaliseSearch([item.title,item.subtitle,item.kind].join(' '));
  return {item,index,score:!q?0:title===q?100:title.startsWith(q)?80:title.includes(q)?60:20,match:tokens.every(token=>all.includes(token))};
 });
 return ranked.filter(row=>row.match).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(row=>row.item);
}
