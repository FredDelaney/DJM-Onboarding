import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),calls=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 let photo=null,settings={intro_line:'Reviewed player headline',key_stats:[{label:'Apps',value:'10'}]},uploads=0;
 await page.route('https://example.supabase.co/**',async route=>{
  if(route.request().method()==='PUT'){uploads++;return route.fulfill({json:{Key:'player-public/'+photo}});}
  if(route.request().method()==='GET')return route.fulfill({status:200,body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),contentType:'image/png'});
  const {action,body={}}=route.request().postDataJSON();calls.push({action,body});
  let result={};
  if(['player_profile','player_profile_core'].includes(action))result={profile:{player:{id:'fixture-profile',first_name:'Example',last_name:'Player',primary_position:'Centre back',current_club:'Example FC',current_country:'NZ',current_season_label:'2026',profile_photo_path:photo},settings,published:{published:false},career:[],videos:[],shares:[],deals:[],clubs:[],documents:[],secondary_ready:true,auto_key_stats:[{label:'Apps',value:24},{label:'Goals',value:0}],auto_stats_meta:{source_name:'Official competition',source_url:'https://example.test/stats'},branding:{support_email:'agent@example.test'}}};
  else if(action==='player_data_status')result={job:null};
  else if(action==='player_profile_photo_begin'){photo='agency/fixture/player/profile.png';result={upload:{path:photo,token:'fixture-token'}};}
  else if(action==='player_profile_photo_attach')result={player:{id:'fixture-profile',profile_photo_path:body.path}};
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
 assert.equal(uploads,1);assert.equal(calls.filter(c=>c.action==='player_profile_photo_attach').length,1);
 const stats=page.getByRole('region',{name:'Club profile stats',exact:true});
 await stats.getByText('Custom stats in use',{exact:true}).waitFor();
 assert.equal(await stats.getByRole('link',{name:'View source',exact:true}).count(),0,'Custom stats do not claim the automatic source');
 await stats.getByRole('button',{name:'Use latest stats',exact:true}).click();
 await stats.getByText('Latest stats in use',{exact:true}).waitFor();
 const save=calls.find(c=>c.action==='player_profile_save');
 assert.deepEqual(save.body.settings,{key_stats:[],selected_stat_refs:[]},'Using current stats writes only the stat selection');
 assert.equal(settings.intro_line,'Reviewed player headline');
 assert.ok((await stats.innerText()).includes('24'));assert.ok((await stats.innerText()).includes('0'));
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Fits '+width);}
 assert.deepEqual(errors,[]);console.log('Photo upload, current CV stats, zero values and four viewport widths passed');
 await page.close();
}finally{await browser.close();}
