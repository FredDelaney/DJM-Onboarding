import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),calls=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 let photo=null,settings={intro_line:'Reviewed player headline',key_stats:[{label:'Apps',value:'10'}]},career=[],uploads=0,verification='verified',attachUnconfirmed=false;
 let otherRequested;const requestedOther=new Promise(resolve=>{otherRequested=resolve;});let releaseOther;
 const workName='Example Player With A Longer Name';
 await page.route('https://example.supabase.co/**',async route=>{
  if(route.request().method()==='PUT'){uploads++;return route.fulfill({json:{Key:'player-public/agency/fixture/player/profile.png'}});}
  if(route.request().method()==='GET')return route.fulfill({status:200,body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),contentType:'image/png'});
  const {action,body={}}=route.request().postDataJSON();calls.push({action,body});
  let result={};
  if(['player_profile','player_profile_core'].includes(action))result={profile:{player:{id:'fixture-profile',first_name:'Example',last_name:'Player',primary_position:'Centre back',current_club:'Example FC',current_country:'NZ',current_season_label:'2026',profile_photo_path:photo,verification_status:verification,verified_at:verification==='verified'?'2026-10-20T09:00:00Z':null},settings,published:{published:false},career,videos:[],shares:[],deals:[],clubs:[],documents:[],secondary_ready:true,auto_key_stats:[{label:'Apps',value:24},{label:'Goals',value:0}],auto_stats_meta:{season_label:'2026',club_name:'Example FC',league:'Example League',checked_at:'2026-10-20T12:00:00Z',source_name:'Official competition',source_url:'https://example.test/stats'},branding:{support_email:'agent@example.test'}}};
  else if(action==='player_workspace'){const other=body.player_id==='fixture-other';if(other){otherRequested();await new Promise(resolve=>{releaseOther=resolve;});}result={player:{identity:{name:other?'Other Player':workName,primary_position:'Centre back',current_club:'Example FC',profile_photo_path:other?null:photo},profile:{},service:{}}};}
  else if(action==='player_data_status')result={job:null};
  else if(action==='player_profile_photo_begin'){result={upload:{path:'agency/fixture/player/profile.png',token:'fixture-token',expected_photo_path:photo}};}
  else if(action==='player_profile_photo_attach'){if(attachUnconfirmed)return route.fulfill({json:{player:{id:'different-player',profile_photo_path:body.path}}});photo=body.path;verification='reviewing';result={player:{id:'fixture-profile',profile_photo_path:photo,verification_status:verification,verified_at:null}};}
  else if(action==='player_profile_save'){settings={...settings,...body.settings};result={ok:true};}
  else return route.fulfill({status:400,json:{error:'Unexpected action '+action}});
  return route.fulfill({json:result});
 });
 const url=new URL('/qa-profile-clean',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
 await page.getByRole('heading',{name:'Example Player',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Add player photo',exact:true}).count(),1,'The empty player photo is an upload control');
 const picker=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'Add player photo',exact:true}).click({timeout:4000});
 await (await picker).setFiles({name:'portrait.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
 await page.getByRole('button',{name:'Change player photo',exact:true}).waitFor();
 await page.getByText('Verification needed',{exact:true}).waitFor();
 assert.equal(await page.getByText('Data verified',{exact:true}).count(),0,'Photo changes show the confirmed verification state');
 assert.equal(uploads,1);assert.equal(calls.filter(c=>c.action==='player_profile_photo_attach').length,1);
 const stats=page.getByRole('region',{name:'Club profile stats',exact:true});
 await stats.getByText('Custom stats in use',{exact:true}).waitFor();
 await stats.getByText('Custom figures, separate from current-season updates. Check their period and source before sharing.',{exact:true}).waitFor();
 assert.equal(await stats.getByText(/Official competition/).count(),0,'Custom figures never inherit the automatic source or freshness');
 assert.equal(await stats.getByRole('link',{name:'View source',exact:true}).count(),0,'Custom stats do not claim the automatic source');
 await stats.getByRole('button',{name:'Use latest stats',exact:true}).click();
 await stats.getByText('Current-season stats in use',{exact:true}).waitFor();
 await stats.getByText('2026 · Example FC · Example League',{exact:true}).waitFor();
 assert.match(await stats.innerText(),/Official competition/);
 assert.match(await stats.innerText(),/Checked/);
 const save=calls.find(c=>c.action==='player_profile_save');
 assert.deepEqual(save.body.settings,{key_stats:[],selected_stat_refs:[]},'Using current stats writes only the stat selection');
 assert.equal(settings.intro_line,'Reviewed player headline');
 assert.ok((await stats.innerText()).includes('24'));assert.ok((await stats.innerText()).includes('0'));
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Fits '+width);}
 // Selected evidence can intentionally cover several seasons; label each without claiming the automatic source.
 career=[
  {id:'past',season_label:'2025',club_name:'Former FC',league:'Historical League',appearances:33,starts:31,source_name:'Historical source',source_reviewed_at:'2026-01-20T12:00:00Z'},
  {id:'current',season_label:'2026',club_name:'Example FC',league:'Example League',goals:0,source_name:'Current source',source_synced_at:'2026-10-20T12:00:00Z'},
  {id:'unsupported',season_label:'2024',club_name:'Other FC',league:'Other League',made_up:99,source_name:'Unused source'},
 ];
 settings={...settings,key_stats:[],selected_stat_refs:['past:appearances','past:starts','current:goals','unsupported:made_up']};
 await page.reload();
 await stats.getByText('Selected stats in use',{exact:true}).waitFor();
 assert.equal(await stats.getByText('2025 · Former FC · Historical League',{exact:true}).count(),1,'A selected period is shown once for several selected fields');
 await stats.getByText('2026 · Example FC · Example League',{exact:true}).waitFor();
 assert.match(await stats.innerText(),/Historical source/);
 assert.match(await stats.innerText(),/Current source/);
 assert.equal(await stats.getByText(/Unused source|Official competition/).count(),0,'Only the selected supported evidence is attributed');
 assert.match(await stats.innerText(),/Reviewed/);
 assert.match(await stats.innerText(),/Updated/);
 // The primary work view reuses the same upload path and shows the confirmed photo immediately.
 photo=null;
 await page.goto(new URL('/qa-player-photo?view=players&player=fixture-profile',url).href);
 await page.getByRole('button',{name:'Add player photo',exact:true}).waitFor();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});
  const title=page.getByRole('heading',{name:workName,exact:true});
  const heading=await title.boundingBox();
  assert.ok(await title.evaluate(node=>node.scrollWidth<=node.clientWidth+1),'The full name wraps without clipping at '+width);
  const edit=await page.getByRole('button',{name:'Edit '+workName,exact:true}).boundingBox();
  assert.ok(heading&&edit&&(edit.x>=heading.x+heading.width||edit.x+edit.width<=heading.x||edit.y>=heading.y+heading.height||edit.y+edit.height<=heading.y),'Player identity and edit controls never overlap at '+width);
 }
 await page.setViewportSize({width:390,height:844});
 await mkdir('/tmp/redream-connected-proof',{recursive:true});
 await page.screenshot({path:'/tmp/redream-connected-proof/player-workspace-mobile.png',fullPage:true});
 attachUnconfirmed=true;
 const workspacePicker=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'Add player photo',exact:true}).click();
 await (await workspacePicker).setFiles({name:'portrait.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
 await page.getByRole('alert').filter({hasText:'The photo could not be confirmed.'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Change player photo',exact:true}).count(),0,'An attachment for a different player cannot claim success');
 const retry=page.getByRole('button',{name:'Retry photo',exact:true});
 assert.ok(await retry.evaluate(node=>{const r=node.getBoundingClientRect();return r.height>=44&&document.elementFromPoint(r.x+r.width/2,r.bottom-2)?.closest('button')===node;}),'The entire photo retry action is reachable without being clipped by the hero');
 attachUnconfirmed=false;await retry.click();
 await page.getByRole('button',{name:'Change player photo',exact:true}).waitFor();
 assert.equal(uploads,2,'Confirmation retry reuses the uploaded object');assert.equal(calls.filter(c=>c.action==='player_profile_photo_attach').length,3);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Work view fits '+width);}
 await page.getByRole('button',{name:'Switch player',exact:true}).click();await requestedOther;
 await page.getByText('Opening player',{exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:workName,exact:true}).count(),0,'Previous player details disappear while the new selection loads');
 assert.equal(await page.getByRole('button',{name:'Change player photo',exact:true}).count(),0,'Previous player photo controls cannot target the new selection');
 releaseOther();await page.getByRole('heading',{name:'Other Player',exact:true}).waitFor();
 await page.getByRole('button',{name:'Add player photo',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('Profile and work-view photo upload, truthful verification, safe player switching, unconfirmed-save retry, current CV stats, zero values and four viewport widths passed');
 await page.close();
}finally{await browser.close();}
