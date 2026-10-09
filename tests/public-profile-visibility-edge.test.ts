import assert from 'node:assert/strict';
import {test,before,after,beforeEach} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {id,profileDatabase} from './helpers/public-profile-fixtures.ts';
import {edgeHandler,jsonResponse,post} from './helpers/public-profile-edge.ts';
let db:PGlite;
let profile:any,custom=true,readError=false,trackError=false,unavailable=false;
const approved=()=>({player_id:id(21),public_slug:'approved-player',published:true,display_name:'Approved Player',headline:'Approved headline',hidden_sections:[],hide_market_value:false,
 why_review:'Approved reason',key_stats:[{label:'Apps',value:'14'}],career_summary:'Approved summary',career_timeline:[{club_name:'Approved club'}],
 primary_video_url:'https://example.invalid/video',selected_videos:[{url:'https://example.invalid/highlight'}],notable_experience:['Approved experience'],
 market_value_display:'Approved value',market_value_source_url:'https://example.invalid/value',stats_url:'https://example.invalid/stats',
 transfermarkt_url:'https://example.invalid/research',wyscout_url:'https://example.invalid/wyscout',contact_email:'approved@example.invalid'});
const sections:any={why_review:{why_review:'SECRET_WHY'},stats:{key_stats:[{label:'SECRET_STATS',value:'1'}]},summary:{career_summary:'SECRET_SUMMARY'},
 career:{career_timeline:[{club_name:'SECRET_CAREER'}]},videos:{primary_video_url:'https://example.invalid/SECRET_VIDEO',selected_videos:[{url:'SECRET_VIDEO'}]},experience:{notable_experience:['SECRET_EXPERIENCE']}};
const cleared:any={why_review:{why_review:null},stats:{key_stats:[]},summary:{career_summary:null},career:{career_timeline:[]},videos:{primary_video_url:null,selected_videos:[]},experience:{notable_experience:[]}};
async function setProfile(value:any){
 profile=value;
 const fields=['display_name','headline','hidden_sections','hide_market_value','why_review','key_stats','career_summary','career_timeline','primary_video_url','selected_videos','notable_experience','market_value_display','market_value_source_url','stats_url','transfermarkt_url','wyscout_url','contact_email'];
 const arrays=new Set(['key_stats','career_timeline','selected_videos','notable_experience']);
 await db.query('update public.player_public_profiles set '+fields.map((f,i)=>f+'=$'+(i+1)+(arrays.has(f)?'::jsonb':'')).join(',')+' where player_id=$'+(fields.length+1),[...fields.map(f=>arrays.has(f)?JSON.stringify(value[f]??null):value[f]??null),id(21)]);
}
async function rpcRead(token=id(181)){return (await db.query('select public.get_club_share($1) data',[token])).rows[0].data as any;}
const transport:typeof fetch=async(input:any,options:any)=>{
 const url=new URL(String(input)), name=url.pathname.split('/').at(-1);
 if(readError)return jsonResponse({message:'synthetic error',code:'XX000'},500);
 if(name==='get_club_share')return jsonResponse(unavailable?null:await rpcRead(JSON.parse(options.body).share_token));
 if(name==='track_club_share_view'){
  if(trackError)return jsonResponse({message:'synthetic tracking failure',code:'XX000'},500);
  return jsonResponse((await db.query('select public.track_club_share_view($1) data',[JSON.parse(options.body).share_token])).rows[0].data);
 }
 if(name==='platform_server_player_profile_context')return jsonResponse({branding:{display_name:'Approved Agency'}});
 if(name==='player_public_profiles')return jsonResponse(unavailable?null:profile);
 if(name==='players')return jsonResponse({id:id(21),tenant_id:id(1),verification_status:'verified',verified_at:'2026-10-09',current_club:'Approved club',current_league:'Approved league',current_season_label:'2026/27'});
 if(name==='player_cv_settings')return jsonResponse({key_stats:custom?[{label:'Apps',value:'14'}]:[]});
 if(name==='career_entries')return jsonResponse([{season_label:'2026/27',club_name:'Approved club',league:'Approved league',appearances:987654,source_name:'SECRET_AUTO_META',source_url:'https://example.invalid/SECRET_AUTO_META',source_reviewed_at:'2026-10-09',source_provider:'public_web_verified'}]);
 if(name==='player_source_refreshes')return jsonResponse(null);
 throw new Error('Unexpected request '+url.pathname);
};
const club=edgeHandler('supabase/functions/club-share-public/index.ts',transport);
const player=edgeHandler('supabase/functions/player-profile-public/index.ts',transport);
before(async()=>{
 db=await profileDatabase();
 await db.query("insert into public.club_share_links(id,player_id,token,organisation_id,active,expires_at,view_count,pitch_status) values($1,$2,$3,$4,true,now()+interval '1 day',0,'ready')",[id(161),id(21),id(181),id(41)]);
 await db.query("insert into public.player_documents(id,player_id,title,document_type,club_shareable,created_at,object_path,bucket_id) values($1,$2,'Approved CV','cv',true,now(),'SECRET_OBJECT_PATH','private'),($3,$2,'SECRET_UNAPPROVED','cv',false,now(),null,null),($4,$5,'SECRET_FOREIGN_PLAYER','cv',true,now(),null,null)",[id(171),id(21),id(172),id(173),id(23)]);
 for(const [i,type]of ['passport',' VISA ','ID','Medical','contract','AGREEMENT'].entries())await db.query('insert into public.player_documents(id,player_id,title,document_type,club_shareable) values($1,$2,$3,$4,true)',[id(190+i),id(21),'SECRET_SENSITIVE',type]);
 await setProfile(approved());
});
after(async()=>{await db?.close();});
beforeEach(()=>{custom=true;readError=false;trackError=false;unavailable=false;});
for(const [section,patch]of Object.entries(sections))test(section+' is redacted independently in SQL and both actual HTTP handlers',async()=>{
 await setProfile({...approved(),...patch,hidden_sections:[section]});
 const sql=await rpcRead();assert.equal(sql.profile.display_name,'Approved Player');assert.ok(!JSON.stringify(sql).includes('SECRET'));
 for(const [name,handler,body]of [['club',club,{token:id(181)}],['player',player,{slug:'approved-player'}]] as const){
  const r=await post(handler,body);assert.equal(r.status,200,name);const payload=await r.json();
  assert.equal(payload.data.profile.display_name,'Approved Player');assert.ok(!JSON.stringify(payload).includes('SECRET'),name+' sent hidden '+section);
  for(const [field,value]of Object.entries(cleared[section]))assert.deepEqual(payload.data.profile[field],value);
 }
});
test('summary and career controls do not hide one another',async()=>{
 for(const section of ['summary','career']){
  await setProfile({...approved(),hidden_sections:[section]});const data=await rpcRead();
  assert.deepEqual(data.profile.career_summary,section==='summary'?null:'Approved summary');
  assert.deepEqual(data.profile.career_timeline,section==='career'?[]:[{club_name:'Approved club'}]);
 }
});
test('automatic statistics and provenance cannot restore a hidden stats section',async()=>{
 custom=false;await setProfile(approved());
 const visible=(await (await post(player,{slug:'approved-player'})).json()).data;
 assert.ok(JSON.stringify(visible).includes('987654'));assert.ok(JSON.stringify(visible).includes('SECRET_AUTO_META'));
 await setProfile({...approved(),hidden_sections:['stats']});
 const r=await post(player,{slug:'approved-player'});const data=(await r.json()).data;
 assert.deepEqual(data.profile.key_stats,[]);assert.equal(data.stats_meta,null);
 assert.ok(!JSON.stringify(data).includes('987654'));assert.ok(!JSON.stringify(data).includes('SECRET_AUTO_META'));
 custom=true;
});
test('unknown columns and internal identifiers are not automatically published',async()=>{
 await setProfile({...approved(),future_sensitive_column:'SECRET_FUTURE'});
 const data=(await (await post(player,{slug:'approved-player'})).json()).data;
 for(const key of ['player_id','public_slug','published','future_sensitive_column'])assert.ok(!(key in data.profile),key);
});
test('market value is public only when hide_market_value is boolean false',async()=>{
 for(const flag of [true,null,undefined,'false',0,{},false]){
  profile={...approved(),hide_market_value:flag,market_value_display:'SECRET_MARKET',market_value_source_url:'https://example.invalid/SECRET_MARKET'};
  const r=await post(player,{slug:'approved-player'});const data=(await r.json()).data.profile;
  assert.equal(data.market_value_display,flag===false?'SECRET_MARKET':null);assert.equal(data.hide_market_value,flag!==false);
 }
 for(const flag of [true,null,false]){await setProfile({...approved(),hide_market_value:flag});const data=(await rpcRead()).profile;assert.equal(data.market_value_display,flag===false?'Approved value':null);}
});
test('malformed hidden_sections fails closed for optional content',async()=>{
 for(const flag of [null,undefined,{},'stats',[null],['stats',42]]){
  profile={...approved(),hidden_sections:flag};
  const data=(await (await post(player,{slug:'approved-player'})).json()).data.profile;
  for(const values of Object.values(cleared))for(const [key,value]of Object.entries(values as any))assert.deepEqual(data[key],value,key);
  assert.equal(data.display_name,'Approved Player');
 }
 await setProfile({...approved(),hidden_sections:null});
 const sql=(await rpcRead()).profile;for(const values of Object.values(cleared))for(const [key,value]of Object.entries(values as any))assert.deepEqual(sql[key],value);
});
test('approved video, research, contact and visible sections survive unchanged',async()=>{
 await setProfile(approved());
 for(const data of [(await rpcRead()).profile,(await (await post(club,{token:id(181)})).json()).data.profile,(await (await post(player,{slug:'approved-player'})).json()).data.profile]){
  for(const key of ['display_name','primary_video_url','selected_videos','transfermarkt_url','wyscout_url','stats_url','contact_email','key_stats','career_summary','career_timeline','market_value_display'])assert.deepEqual(data[key],approved()[key]);
 }
});
test('denied share tokens create no views and approved document metadata stays narrow',async()=>{
 await setProfile(approved());
 const count=async()=>(await db.query('select count(*)::int n from public.club_share_views')).rows[0].n;
 const prior=await count();
 for(const [change,reset]of [
  ['update public.club_share_links set active=false','update public.club_share_links set active=true'],
  ["update public.club_share_links set expires_at=now()-interval '1 second'","update public.club_share_links set expires_at=now()+interval '1 day'"],
  ['update public.player_public_profiles set published=false','update public.player_public_profiles set published=true'],
  ["update public.players set verification_status='pending'","update public.players set verification_status='verified'"],
  ['update public.players set verified_at=null','update public.players set verified_at=now()']
 ]){
  await db.exec(change);assert.equal(await rpcRead(),null);const r=await post(club,{token:id(181)});assert.deepEqual(await r.json(),{data:null});await db.exec(reset);
 }
 assert.equal(await count(),prior);
 const r=await post(club,{token:id(181)});const data=(await r.json()).data;assert.equal(await count(),Number(prior)+1);
 assert.equal(data.documents.length,1);assert.deepEqual(Object.keys(data.documents[0]).sort(),['created_at','document_type','id','title']);
 assert.ok(!JSON.stringify(data).includes('SECRET'));assert.equal(data.target_club,'Recorded Club');
 await db.query('update public.club_share_links set organisation_id=$1',[id(42)]);assert.equal((await rpcRead()).target_club,null);
 await db.query('update public.club_share_links set organisation_id=$1',[id(41)]);
});
test('browser roles cannot execute privileged public-profile RPCs',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.query('select public.get_club_share($1)',[id(181)]),/permission denied/);
  await assert.rejects(db.query('select public.track_club_share_view($1)',[id(181)]),/permission denied/);
  await db.exec('reset role');
 }
});
test('CORS, method restrictions, unavailable profiles, upstream failures and tracking failure remain truthful',async()=>{
 for(const handler of [club,player]){
  const preflight=await handler(new Request('https://synthetic.invalid',{method:'OPTIONS'}));assert.equal(preflight.status,200);assert.equal(preflight.headers.get('access-control-allow-origin'),'*');assert.equal(preflight.headers.get('cache-control'),'no-store');
  assert.equal((await handler(new Request('https://synthetic.invalid'))).status,405);
  unavailable=true;assert.deepEqual(await (await post(handler,handler===club?{token:id(181)}:{slug:'approved-player'})).json(),{data:null});unavailable=false;
  readError=true;assert.equal((await post(handler,handler===club?{token:id(181)}:{slug:'approved-player'})).status,500);readError=false;
 }
 await setProfile(approved());trackError=true;assert.equal((await post(club,{token:id(181)})).status,200);trackError=false;
 for(const body of [{},{token:'bad-token'},{token:id(182)}]){unavailable=true;assert.deepEqual(await (await post(club,body)).json(),{data:null});unavailable=false;}
});

test('SQL and TypeScript projections agree on malformed values without mutating snapshots',async()=>{
 const {visiblePublicPlayerProfile}=await import('../supabase/functions/_shared/public-profile-visibility.ts');
 for(const value of [null,{},[],7,'invalid',approved(),{...approved(),hidden_sections:null},{...approved(),hidden_sections:['stats',null]},{...approved(),hidden_sections:['summary','videos'],hide_market_value:'false',future_column:'SECRET_FUTURE'}]){
  const snapshot=structuredClone(value);
  const sql=(await db.query('select private.visible_public_player_profile($1::jsonb) data',[JSON.stringify(value)])).rows[0].data;
  assert.deepEqual(visiblePublicPlayerProfile(value),sql);assert.deepEqual(value,snapshot);
 }
});
