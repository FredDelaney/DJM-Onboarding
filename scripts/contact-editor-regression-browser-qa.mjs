import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),calls=[];
 let reach={email:{value:'example@example.test',is_verified:false},whatsapp:{value:'+393331234567',is_verified:false},phone:{value:'+393331234568',is_verified:false}};
 const person=()=>({person:{person_id:'person-fixture',full_name:'Example Contact'},reach,employment:{employment_id:'employment-fixture',organisation_name:'Example FC',role_title:'Sporting director',verification_state:'recently_verified'},relationship_memory:{state:'current',recent_interactions:[],promises:[],followups:[]}});
 await page.route('https://example.supabase.co/**',async route=>{
  const {action,body={}}=route.request().postDataJSON();calls.push({action,body});let result={};
  if(action==='redream_relationship_person')result=person();
  else if(action==='redream_record_contact_details_v1')result={email:reach.email?.value||null,whatsapp:reach.whatsapp?.value||null,can_edit:true};
  else if(action==='redream_relationship_save_contact_method'){reach[body.p_channel]={value:body.p_value,is_verified:body.p_mark_verified};result=person();}
  else if(action==='redream_birthday_record')result={birthday:null};
  else return route.fulfill({status:400,json:{error:'Unexpected '+action}});
  await route.fulfill({json:result});
 });
 const url=new URL('/qa-record-clean?kind=contact',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
 await page.getByRole('button',{name:'Edit details',exact:true}).click();
 await page.getByRole('checkbox',{name:/checked/}).check();
 await page.getByRole('button',{name:'Save contact details',exact:true}).click();
 await page.getByRole('button',{name:'Edit details',exact:true}).waitFor();
 assert.deepEqual(calls.filter(c=>c.action==='redream_relationship_save_contact_method').map(c=>[c.body.p_channel,c.body.p_mark_verified]),[['email',true],['whatsapp',true],['phone',true]],'Verifying unchanged contact details covers all existing channels');
 console.log('Legacy contact verification remains working for email, WhatsApp and phone');
}finally{await browser.close();}
