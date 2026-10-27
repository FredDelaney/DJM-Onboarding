export const PLAYER_DETAILS = {
 current_club:{label:'Current club',type:'text'},current_league:{label:'Competition',type:'text'},current_country:{label:'Country',type:'text'},
 current_season_label:{label:'Season',type:'text'},primary_position:{label:'Position',type:'text'},
 contract_status:{label:'Contract status',type:'text'},contract_expiry:{label:'Contract expiry',type:'date'},
 date_of_birth:{label:'Date of birth',type:'date'},nationalities:{label:'Nationalities',type:'list'},
 height_cm:{label:'Height (cm)',type:'number'},preferred_foot:{label:'Preferred foot',type:'foot'},
 transfermarkt_url:{label:'Transfermarkt URL',type:'url'},stats_url:{label:'Statistics URL',type:'url'},
} as const;
export type DetailField = keyof typeof PLAYER_DETAILS;
export type DetailValue = string | number | string[];
export type DetailSuggestion = {id:string;field:DetailField;before:DetailValue|null;suggested:DetailValue;decision:'pending'|'accepted'|'rejected';applied_value?:DetailValue|null;sources:{title?:string;url:string}[]};
export type DetailsReview = {id:string;status:'running'|'needs_review'|'applied'|'rejected'|'cancelled'|'failed';checked_at?:string|null;reason?:string|null;fields:DetailSuggestion[]};
export type DetailChoice = {decision:'later'|'accept'|'edit'|'reject';value:string};
export type DetailChoices = Record<string,DetailChoice>;
export const detailText=(value:unknown):string=>Array.isArray(value)?value.join(', '):value==null?'':String(value);
export function parseDetailsReview(raw:any):DetailsReview|null {
 if(raw==null)return null;
 if(typeof raw.id!=='string'||!raw.id||!['running','needs_review','applied','rejected','cancelled','failed'].includes(raw.status)||!Array.isArray(raw.fields)||raw.fields.length>13||raw.fields.some((f:any)=>typeof f.id!=='string'||!f.id||!Object.hasOwn(PLAYER_DETAILS,f.field)||!['pending','accepted','rejected'].includes(f.decision)||!Array.isArray(f.sources)||f.sources.length>8||f.sources.some((source:any)=>typeof source?.url!=='string')))throw new Error('Player details could not load. Please try again.');
 return raw as DetailsReview;
}
export function reconcileDetailChoices(review:DetailsReview|null,previous:DetailChoices):DetailChoices {
 return Object.fromEntries((review?.fields||[]).filter(f=>f.decision==='pending').map(f=>[f.id,previous[f.id]||{decision:'later',value:detailText(f.suggested)}]));
}
export function detailValue(field:DetailField,draft:string):DetailValue {
 const value=draft.trim(),meta=PLAYER_DETAILS[field];
 if(!value)throw new Error(`Add ${meta.label.toLowerCase()}, or keep the recorded value.`);
 if(meta.type==='number'){
  if(!/^\d+$/.test(value)||Number(value)<140||Number(value)>230)throw new Error('Height must be between 140 and 230 cm.');
  return Number(value);
 }
 if(meta.type==='list'){
  const values=value.split(',').map(v=>v.trim()).filter(Boolean);
  if(!values.length||values.length>5||values.some(v=>v.length>80))throw new Error('Add up to five nationalities, separated by commas.');
  return values;
 }
 if(meta.type==='date'){
  const stamp=Date.parse(value);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==value||value<'1900-01-01'||(field==='date_of_birth'&&value>=new Date().toISOString().slice(0,10)))throw new Error(`Add the complete recorded ${meta.label.toLowerCase()}.`);
 }
 if(meta.type==='foot'&&!['Left','Right','Both'].includes(value))throw new Error('Choose Left, Right or Both.');
 if(meta.type==='url'){
  try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error();}
  catch{throw new Error('Add a valid http or https profile link.');}
 }
 if(value.length>(meta.type==='url'?600:160))throw new Error(`${meta.label} is too long.`);
 return value;
}
export function detailsDecisions(review:DetailsReview,choices:DetailChoices) {
 return review.fields.filter(f=>f.decision==='pending'&&choices[f.id]?.decision!=='later'&&choices[f.id]).map(f=>{
  const choice=choices[f.id];return {id:f.id,decision:choice.decision,...(choice.decision==='edit'?{value:detailValue(f.field,choice.value)}:{})};
 });
}
