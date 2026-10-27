import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],saves=[];page.on('pageerror',error=>errors.push(error.message));
 const records={};let conflict=false,delayRelease;
 await page.route('https://example.supabase.co/**',async route=>{
  const {name,args={},scope}=route.request().postDataJSON();assert.equal(name,'redream_record_contact_details_v1');
  const key=scope+':'+args.p_kind;records[key]||={email:null,whatsapp:null,can_edit:true};
  if(scope==='second')await new Promise(resolve=>setTimeout(resolve,300));
  if(args.p_patch){saves.push({args,scope});if(conflict){conflict=false;return route.fulfill({status:409,json:{error:'Contact details changed. Load the latest details before saving.'}});}records[key]={...records[key],...args.p_patch};}
  await route.fulfill({json:records[key]});
 });
 const url=new URL('/qa-contact-details',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
 for(const kind of ['player','recruitment_target','contact']){
  const root=page.getByRole('region',{name:'Contact details for '+kind,exact:true});
  await root.getByRole('button',{name:'Edit contact details for '+kind,exact:true}).waitFor({state:'visible'});
  await root.getByRole('button',{name:'Add WhatsApp for '+kind,exact:true}).click();
  await root.getByLabel('WhatsApp',{exact:true}).fill('0039 (333) 123-4567');
  await root.getByLabel('Email',{exact:true}).fill('agent+clubs@example.test');
  await root.getByRole('button',{name:'Save details',exact:true}).click();
  await root.getByRole('link',{name:'WhatsApp '+kind,exact:true}).waitFor();
  assert.equal(await root.getByRole('link',{name:'WhatsApp '+kind,exact:true}).getAttribute('href'),'https://wa.me/393331234567');
  assert.equal(await root.getByRole('link',{name:'Email '+kind,exact:true}).getAttribute('href'),'mailto:agent%2Bclubs@example.test');
  await root.getByRole('button',{name:'Edit contact details for '+kind,exact:true}).click();
  assert.equal(await root.getByRole('button',{name:'Save details',exact:true}).isDisabled(),true);
  await root.getByLabel('Email',{exact:true}).fill('');
  await root.getByRole('button',{name:'Save details',exact:true}).click();
  await root.getByRole('button',{name:'Add email for '+kind,exact:true}).waitFor();
  assert.deepEqual(saves.at(-1).args.p_patch,{email:null});
 }
 const player=page.getByRole('region',{name:'Contact details for player',exact:true});
 await player.getByRole('button',{name:'Edit contact details for player',exact:true}).click();
 await player.getByLabel('WhatsApp',{exact:true}).fill('3331234567');const before=saves.length;
 await player.getByRole('button',{name:'Save details',exact:true}).click();
 await player.getByRole('alert').filter({hasText:'country code'}).waitFor();assert.equal(saves.length,before,'Invalid local phone numbers never reach the server');
 await player.getByLabel('WhatsApp',{exact:true}).fill('+393331234568');conflict=true;
 await player.getByRole('button',{name:'Save details',exact:true}).click();
 await player.getByRole('alert').filter({hasText:'Contact details changed'}).waitFor();assert.equal(await player.getByLabel('WhatsApp',{exact:true}).inputValue(),'+393331234568');
 records['first:player'].email='parallel@example.test';
 await player.getByRole('button',{name:'Load latest details',exact:true}).click();
 await player.getByText('Latest details loaded. Review your changes before saving.',{exact:true}).waitFor();
 assert.equal(await player.getByLabel('Email',{exact:true}).inputValue(),'parallel@example.test','Untouched channels refresh from the concurrent save');
 await player.getByRole('button',{name:'Save details',exact:true}).click();
 await player.getByRole('status').filter({hasText:'Contact details saved.'}).waitFor();
 assert.deepEqual(saves.at(-1).args.p_patch,{whatsapp:'+393331234568'},'Conflict recovery cannot revert an untouched concurrent channel');
 await page.getByRole('button',{name:'Switch account',exact:true}).click();
 assert.equal(await page.getByRole('link',{name:'WhatsApp player',exact:true}).count(),0,'Account switching immediately removes earlier links');
 await player.getByRole('button',{name:'Add email for player',exact:true}).waitFor();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.deepEqual(errors,[]);console.log('Contact controls passed for all three record types, clearing, validation, stale saves and account switching');
}finally{await browser.close();}
